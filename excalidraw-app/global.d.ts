import "@excalidraw/excalidraw/global";
import "@excalidraw/excalidraw/css";

interface FileSystemHandlePermissionDescriptor {
  mode?: "read" | "readwrite";
}

interface FileSystemDirectoryPickerOptions {
  id?: string;
  mode?: "read" | "readwrite";
  startIn?:
    | FileSystemHandle
    | "desktop"
    | "documents"
    | "downloads"
    | "music"
    | "pictures"
    | "videos";
}

interface FileSystemDirectoryHandle {
  queryPermission(
    descriptor?: FileSystemHandlePermissionDescriptor,
  ): Promise<PermissionState>;
  requestPermission(
    descriptor?: FileSystemHandlePermissionDescriptor,
  ): Promise<PermissionState>;
}

interface Window {
  __EXCALIDRAW_SHA__: string | undefined;
  showDirectoryPicker?: (
    options?: FileSystemDirectoryPickerOptions,
  ) => Promise<FileSystemDirectoryHandle>;
}
