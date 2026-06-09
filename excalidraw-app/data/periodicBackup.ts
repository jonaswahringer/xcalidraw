import {
  debounce,
  EXPORT_DATA_TYPES,
  getExportSource,
  MIME_TYPES,
  VERSIONS,
} from "@excalidraw/common";
import { getNonDeletedElements, isInitializedImageElement } from "@excalidraw/element";
import { cleanAppStateForExport } from "@excalidraw/excalidraw/appState";
import { createStore, del, get, set } from "idb-keyval";

import type { ExcalidrawElement, FileId } from "@excalidraw/element/types";
import type { ExportedDataState } from "@excalidraw/excalidraw/data/types";
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
  PageSnapshot,
} from "@excalidraw/excalidraw/types";

import {
  BACKUP_DEBOUNCE_MS,
  PERIODIC_BACKUP_DIR_HANDLE_KEY,
  PERIODIC_BACKUP_ENABLED_KEY,
  SUGGESTED_BACKUP_DIR,
} from "../app_constants";

import { FileStatusStore } from "./fileStatusStore";
import { LocalData } from "./LocalData";

type BackupDirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission(descriptor?: {
    mode?: "read" | "readwrite";
  }): Promise<PermissionState>;
  requestPermission(descriptor?: {
    mode?: "read" | "readwrite";
  }): Promise<PermissionState>;
};

const backupStore = createStore("xcalidraw-backup-db", "backup-store");

export type BackupSaveState = "idle" | "pending" | "saving";

export type BackupStatus = {
  enabled: boolean;
  saveState: BackupSaveState;
  debounceStartedAt: number | null;
  lastBackupAt: number | null;
  lastError: string | null;
  directoryName: string | null;
};

let backupInProgress = false;
let backupPending = false;
let backupPendingForce = false;
let lastChangeAt: number | null = null;
let excalidrawAPIRef: ExcalidrawImperativeAPI | null = null;
const lastBackupHashByPageId = new Map<string, string>();

const statusListeners = new Set<(status: BackupStatus) => void>();

let status: BackupStatus = {
  enabled: false,
  saveState: "idle",
  debounceStartedAt: null,
  lastBackupAt: null,
  lastError: null,
  directoryName: null,
};

const updateSaveStateAfterBackup = () => {
  if (!isPeriodicBackupEnabled()) {
    setStatus({ saveState: "idle", debounceStartedAt: null });
    return;
  }

  if (hasUnbackedUpChanges()) {
    setStatus({ saveState: "pending" });
    return;
  }

  setStatus({ saveState: "idle", debounceStartedAt: null });
};

const notifyStatus = () => {
  for (const listener of statusListeners) {
    listener(status);
  }
};

const setStatus = (patch: Partial<BackupStatus>) => {
  status = { ...status, ...patch };
  notifyStatus();
};

export const subscribeBackupStatus = (
  listener: (status: BackupStatus) => void,
): (() => void) => {
  statusListeners.add(listener);
  listener(status);
  return () => statusListeners.delete(listener);
};

export const getBackupStatus = () => status;

export const isPeriodicBackupEnabled = () =>
  localStorage.getItem(PERIODIC_BACKUP_ENABLED_KEY) === "true";

const getShowDirectoryPicker = () => {
  if (typeof window === "undefined") {
    return undefined;
  }

  return (
    window as Window & {
      showDirectoryPicker?: (options?: {
        mode?: "read" | "readwrite";
        startIn?: "documents";
      }) => Promise<BackupDirectoryHandle>;
    }
  ).showDirectoryPicker;
};

const isLikelyBraveBrowser = () => {
  const navigatorWithBrave = navigator as Navigator & {
    brave?: unknown;
  };

  return (
    navigatorWithBrave.brave != null || /Brave/i.test(navigator.userAgent)
  );
};

export const getBackupUnavailableReason = (): string | null => {
  if (typeof window === "undefined") {
    return "Folder backup is not available in this environment.";
  }

  if (!window.isSecureContext) {
    return `Folder backup requires a secure connection (https:// or http://localhost). You are on ${window.location.origin}.`;
  }

  if (typeof getShowDirectoryPicker() !== "function") {
    if (isLikelyBraveBrowser()) {
      return "Brave disables folder backup by default. Open brave://flags/#file-system-access-api, set it to Enabled, then relaunch Brave.";
    }

    return "Folder backup is not available in this browser. Use Chrome or Edge, or enable the File System Access API flag in Brave.";
  }

  return null;
};

export const isBackupSupported = () => getBackupUnavailableReason() === null;

export const registerBackupClient = (
  excalidrawAPI: ExcalidrawImperativeAPI | null,
) => {
  excalidrawAPIRef = excalidrawAPI;
};

const scheduleBackup = debounce(() => {
  setStatus({ saveState: "saving", debounceStartedAt: null });
  if (excalidrawAPIRef) {
    void runPeriodicBackup(excalidrawAPIRef);
  }
}, BACKUP_DEBOUNCE_MS);

export const flushScheduledBackup = () => {
  if (!isPeriodicBackupEnabled()) {
    return;
  }
  setStatus({ saveState: "saving", debounceStartedAt: null });
  scheduleBackup.flush();
};

export const markBackupDirty = () => {
  if (!isPeriodicBackupEnabled()) {
    return;
  }
  lastChangeAt = Date.now();
  setStatus({
    saveState: backupInProgress ? "saving" : "pending",
    debounceStartedAt: Date.now(),
  });
  scheduleBackup();
};

export const hasUnbackedUpChanges = () => {
  if (!isPeriodicBackupEnabled() || lastChangeAt === null) {
    return false;
  }

  return status.lastBackupAt === null || lastChangeAt > status.lastBackupAt;
};

export const isBackupRunning = () => backupInProgress;

export const shouldPreventUnloadForBackup = () =>
  isPeriodicBackupEnabled() &&
  (isBackupRunning() || hasUnbackedUpChanges());

const filterOutDeletedFiles = (
  elements: readonly ExcalidrawElement[],
  files: BinaryFiles,
) => {
  const nextFiles: BinaryFiles = {};
  for (const element of elements) {
    if (
      !element.isDeleted &&
      "fileId" in element &&
      element.fileId &&
      files[element.fileId]
    ) {
      nextFiles[element.fileId] = files[element.fileId];
    }
  }
  return nextFiles;
};

/** Compact JSON — faster to stringify/hash than pretty-printed export. */
const serializePageForBackup = (
  elements: readonly ExcalidrawElement[],
  appState: Partial<AppState>,
  files: BinaryFiles,
): string => {
  const data: ExportedDataState = {
    type: EXPORT_DATA_TYPES.excalidraw,
    version: VERSIONS.excalidraw,
    source: getExportSource(),
    elements,
    appState: cleanAppStateForExport(appState),
    files: filterOutDeletedFiles(elements, files),
  };

  return JSON.stringify(data);
};

const hashBackupContent = async (content: string) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(content),
  );

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const sanitizeFilename = (name: string) => {
  const sanitized = name.replace(/[/\\?%*:|"<>]/g, "-").trim();
  return sanitized || "Untitled";
};

const buildPageFilenames = (pages: readonly PageSnapshot[]) => {
  const used = new Map<string, number>();

  return pages.map((page) => {
    const base = sanitizeFilename(page.name);
    const count = used.get(base) ?? 0;
    used.set(base, count + 1);
    return count === 0 ? base : `${base}-${count + 1}`;
  });
};

const clonePageSnapshots = (
  pages: readonly PageSnapshot[],
): PageSnapshot[] =>
  pages.map((page) => ({
    id: page.id,
    name: page.name,
    elements: page.elements.map((element) => ({ ...element })),
    appState: { ...page.appState },
  }));

const getFileIdsFromElements = (
  elements: readonly ExcalidrawElement[],
): FileId[] => {
  const ids: FileId[] = [];
  for (const element of elements) {
    if (isInitializedImageElement(element)) {
      ids.push(element.fileId);
    }
  }
  return ids;
};

const buildFilesForPage = async (
  elements: readonly ExcalidrawElement[],
  inMemoryFiles: BinaryFiles,
): Promise<BinaryFiles> => {
  const fileIds = getFileIdsFromElements(elements);
  const files: BinaryFiles = {};
  const missingIds: FileId[] = [];

  for (const id of fileIds) {
    if (inMemoryFiles[id]) {
      files[id] = inMemoryFiles[id];
    } else {
      missingIds.push(id);
    }
  }

  if (missingIds.length) {
    const { loadedFiles } = await LocalData.fileStorage.getFiles(missingIds);
    for (const file of loadedFiles) {
      files[file.id] = file;
    }
  }

  return files;
};

const waitForPendingImages = async () => {
  let snapshot = FileStatusStore.getSnapshot();

  while (true) {
    const { pending } = FileStatusStore.getPendingCount(snapshot.value);
    if (pending === 0) {
      return;
    }
    snapshot = await FileStatusStore.pull(snapshot.version);
  }
};

const ensureDirectoryPermission = async (dirHandle: BackupDirectoryHandle) => {
  const currentPermission = await dirHandle.queryPermission({
    mode: "readwrite",
  });

  if (currentPermission === "granted") {
    return true;
  }

  const requestedPermission = await dirHandle.requestPermission({
    mode: "readwrite",
  });

  return requestedPermission === "granted";
};

const writeSerializedBackup = async (
  dirHandle: BackupDirectoryHandle,
  filename: string,
  serialized: string,
) => {
  const blob = new Blob([serialized], { type: MIME_TYPES.excalidraw });

  const fileHandle = await dirHandle.getFileHandle(`${filename}.excalidraw`, {
    create: true,
  });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
};

const pruneStalePageHashes = (pages: readonly PageSnapshot[]) => {
  const currentPageIds = new Set(pages.map((page) => page.id));
  for (const pageId of lastBackupHashByPageId.keys()) {
    if (!currentPageIds.has(pageId)) {
      lastBackupHashByPageId.delete(pageId);
    }
  }
};

const getStoredDirectoryHandle = async (): Promise<BackupDirectoryHandle | null> => {
  try {
    return (
      (await get<BackupDirectoryHandle>(
        PERIODIC_BACKUP_DIR_HANDLE_KEY,
        backupStore,
      )) ?? null
    );
  } catch (error) {
    console.error(error);
    return null;
  }
};

const storeDirectoryHandle = async (dirHandle: BackupDirectoryHandle) => {
  await set(PERIODIC_BACKUP_DIR_HANDLE_KEY, dirHandle, backupStore);
};

const clearStoredDirectoryHandle = async () => {
  await del(PERIODIC_BACKUP_DIR_HANDLE_KEY, backupStore);
};

export const pickBackupDirectory = (): Promise<boolean> => {
  const unavailableReason = getBackupUnavailableReason();
  if (unavailableReason) {
    setStatus({ lastError: unavailableReason });
    return Promise.resolve(false);
  }

  const showDirectoryPicker = getShowDirectoryPicker();
  if (!showDirectoryPicker) {
    const reason = isLikelyBraveBrowser()
      ? "Brave disables folder backup by default. Open brave://flags/#file-system-access-api, set it to Enabled, then relaunch Brave."
      : "Folder backup is not available in this browser. Use Chrome or Edge, or enable the File System Access API flag in Brave.";
    setStatus({ lastError: reason });
    return Promise.resolve(false);
  }

  // Must be invoked synchronously while the user gesture is still active.
  const pickerPromise = showDirectoryPicker({
    mode: "readwrite",
    startIn: "documents",
  });

  return finishPickingBackupDirectory(pickerPromise);
};

const finishPickingBackupDirectory = async (
  pickerPromise: Promise<BackupDirectoryHandle>,
): Promise<boolean> => {
  try {
    const dirHandle = await pickerPromise;

    const hasPermission = await ensureDirectoryPermission(dirHandle);
    if (!hasPermission) {
      setStatus({ lastError: "Write permission to the backup folder was denied." });
      return false;
    }

    await storeDirectoryHandle(dirHandle);
    localStorage.setItem(PERIODIC_BACKUP_ENABLED_KEY, "true");
    lastBackupHashByPageId.clear();
    setStatus({
      enabled: true,
      saveState: "idle",
      debounceStartedAt: null,
      directoryName: dirHandle.name,
      lastError: null,
    });

    return true;
  } catch (error: any) {
    if (error?.name !== "AbortError") {
      console.error(error);
      setStatus({ lastError: "Could not select a backup folder." });
    }
    return false;
  }
};

export const disablePeriodicBackup = async () => {
  scheduleBackup.cancel();
  localStorage.removeItem(PERIODIC_BACKUP_ENABLED_KEY);
  await clearStoredDirectoryHandle();
  lastBackupHashByPageId.clear();
  setStatus({
    enabled: false,
    saveState: "idle",
    debounceStartedAt: null,
    directoryName: null,
    lastError: null,
  });
};

export const restorePeriodicBackup = async () => {
  const enabled = isPeriodicBackupEnabled();
  if (!enabled) {
    setStatus({ enabled: false, saveState: "idle", debounceStartedAt: null });
    return false;
  }

  const dirHandle = await getStoredDirectoryHandle();
  if (!dirHandle) {
    localStorage.removeItem(PERIODIC_BACKUP_ENABLED_KEY);
    setStatus({
      enabled: false,
      saveState: "idle",
      debounceStartedAt: null,
      lastError: null,
    });
    return false;
  }

  const hasPermission = await ensureDirectoryPermission(dirHandle);
  if (!hasPermission) {
    setStatus({
      enabled: true,
      saveState: "idle",
      debounceStartedAt: null,
      directoryName: dirHandle.name,
      lastError: `Re-grant access to ${SUGGESTED_BACKUP_DIR} via the menu.`,
    });
    return false;
  }

  setStatus({
    enabled: true,
    saveState: "idle",
    debounceStartedAt: null,
    directoryName: dirHandle.name,
    lastError: null,
  });

  return true;
};

export const runPeriodicBackup = async (
  excalidrawAPI: ExcalidrawImperativeAPI,
  options?: { force?: boolean },
) => {
  if (backupInProgress) {
    backupPending = true;
    if (options?.force) {
      backupPendingForce = true;
    }
    return;
  }

  backupInProgress = true;
  setStatus({ saveState: "saving", debounceStartedAt: null });

  try {
    do {
      const force = options?.force || backupPendingForce;
      backupPending = false;
      backupPendingForce = false;
      await performBackup(excalidrawAPI, { force });
    } while (backupPending);
  } finally {
    backupInProgress = false;
    updateSaveStateAfterBackup();
  }
};

const performBackup = async (
  excalidrawAPI: ExcalidrawImperativeAPI,
  { force = false }: { force?: boolean } = {},
) => {
  if (!isPeriodicBackupEnabled()) {
    return;
  }

  const dirHandle = await getStoredDirectoryHandle();
  if (!dirHandle) {
    setStatus({
      enabled: false,
      lastError: "Backup folder handle is missing. Re-enable automatic backup.",
    });
    localStorage.removeItem(PERIODIC_BACKUP_ENABLED_KEY);
    return;
  }

  const hasPermission = await ensureDirectoryPermission(dirHandle);
  if (!hasPermission) {
    setStatus({
      lastError: "Backup skipped: no write permission for the backup folder.",
    });
    return;
  }

  try {
    LocalData.flushSave();
    await waitForPendingImages();

    const pages = clonePageSnapshots(excalidrawAPI.getPageSnapshots());
    const filenames = buildPageFilenames(pages);
    const inMemoryFiles = excalidrawAPI.getFiles();
    let wroteAnyPage = false;

    for (let index = 0; index < pages.length; index++) {
      const page = pages[index];
      const elements = getNonDeletedElements(page.elements);
      const files = await buildFilesForPage(elements, inMemoryFiles);
      const serialized = serializePageForBackup(
        elements,
        page.appState,
        files,
      );
      const hash = await hashBackupContent(serialized);

      if (!force && lastBackupHashByPageId.get(page.id) === hash) {
        continue;
      }

      await writeSerializedBackup(dirHandle, filenames[index], serialized);
      lastBackupHashByPageId.set(page.id, hash);
      wroteAnyPage = true;
    }

    pruneStalePageHashes(pages);

    if (wroteAnyPage || pages.length > 0) {
      setStatus({
        lastBackupAt: Date.now(),
        lastError: null,
        directoryName: dirHandle.name,
      });
    }
  } catch (error: any) {
    console.error(error);
    setStatus({
      lastError: error?.message ?? "Automatic backup failed.",
    });
  }
};
