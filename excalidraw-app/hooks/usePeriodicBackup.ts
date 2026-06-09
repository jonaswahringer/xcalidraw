import { useEffect } from "react";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import {
  flushScheduledBackup,
  hasUnbackedUpChanges,
  isPeriodicBackupEnabled,
  registerBackupClient,
  restorePeriodicBackup,
  runPeriodicBackup,
} from "../data/periodicBackup";

export const usePeriodicBackup = (
  excalidrawAPI: ExcalidrawImperativeAPI | null,
  isCollaborating: boolean,
) => {
  useEffect(() => {
    restorePeriodicBackup();
  }, []);

  useEffect(() => {
    registerBackupClient(excalidrawAPI);
    return () => registerBackupClient(null);
  }, [excalidrawAPI]);

  // Best-effort flush when the tab is hidden or closed.
  useEffect(() => {
    if (!excalidrawAPI || !isPeriodicBackupEnabled() || isCollaborating) {
      return;
    }

    const backupIfDirty = () => {
      if (!hasUnbackedUpChanges()) {
        return;
      }
      flushScheduledBackup();
      void runPeriodicBackup(excalidrawAPI);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        backupIfDirty();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", backupIfDirty);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", backupIfDirty);
    };
  }, [excalidrawAPI, isCollaborating]);
};
