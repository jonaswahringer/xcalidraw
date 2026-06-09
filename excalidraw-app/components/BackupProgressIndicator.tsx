import { useTunnels } from "@excalidraw/excalidraw/context/tunnels";
import { useUIAppState } from "@excalidraw/excalidraw/context/ui-appState";
import { useEffect, useState } from "react";

import { BACKUP_DEBOUNCE_MS } from "../app_constants";
import {
  getBackupStatus,
  subscribeBackupStatus,
} from "../data/periodicBackup";

import "./BackupProgressIndicator.scss";

export const BackupProgressIndicator = () => {
  const { ToolbarFooterTunnel } = useTunnels();
  const appState = useUIAppState();
  const [backupStatus, setBackupStatus] = useState(getBackupStatus());

  useEffect(() => subscribeBackupStatus(setBackupStatus), []);

  if (
    appState.viewModeEnabled ||
    appState.zenModeEnabled ||
    appState.openDialog?.name === "elementLinkSelector"
  ) {
    return null;
  }

  const showProgress =
    backupStatus.enabled &&
    backupStatus.saveState === "pending" &&
    backupStatus.debounceStartedAt != null;

  if (!showProgress) {
    return null;
  }

  return (
    <ToolbarFooterTunnel.In>
      <div
        key={backupStatus.debounceStartedAt}
        className="excalidraw-app-backup-progress"
        style={{ animationDuration: `${BACKUP_DEBOUNCE_MS}ms` }}
        title="Backup scheduled…"
        aria-hidden
      />
    </ToolbarFooterTunnel.In>
  );
};
