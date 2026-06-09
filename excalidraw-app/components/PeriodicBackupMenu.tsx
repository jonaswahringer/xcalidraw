import { save } from "@excalidraw/excalidraw/components/icons";
import { MainMenu } from "@excalidraw/excalidraw/index";
import { useEditorInterface } from "@excalidraw/excalidraw/components/App";
import React, { useEffect, useState } from "react";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { SUGGESTED_BACKUP_DIR } from "../app_constants";
import {
  disablePeriodicBackup,
  getBackupStatus,
  getBackupUnavailableReason,
  pickBackupDirectory,
  runPeriodicBackup,
  subscribeBackupStatus,
} from "../data/periodicBackup";

const formatLastBackup = (timestamp: number | null) => {
  if (!timestamp) {
    return "never";
  }
  return new Date(timestamp).toLocaleTimeString();
};

const startBackupSetup = (
  excalidrawAPI: ExcalidrawImperativeAPI | null,
  event?: Event,
) => {
  event?.preventDefault();
  pickBackupDirectory().then((enabled) => {
    if (enabled && excalidrawAPI) {
      void runPeriodicBackup(excalidrawAPI, { force: true });
    }
  });
};

export const PeriodicBackupMenu: React.FC<{
  excalidrawAPI: ExcalidrawImperativeAPI | null;
}> = ({ excalidrawAPI }) => {
  const editorInterface = useEditorInterface();
  const [backupStatus, setBackupStatus] = useState(getBackupStatus());
  const unavailableReason = getBackupUnavailableReason();

  useEffect(() => subscribeBackupStatus(setBackupStatus), []);

  const runBackupNow = () => {
    if (excalidrawAPI) {
      void runPeriodicBackup(excalidrawAPI, { force: true });
    }
  };

  if (!backupStatus.enabled) {
    return (
      <MainMenu.Item
        icon={save}
        title={unavailableReason ?? "Choose a folder for automatic backups"}
        onSelect={(event) => startBackupSetup(excalidrawAPI, event)}
      >
        Backup to folder…
      </MainMenu.Item>
    );
  }

  return (
    <MainMenu.Sub>
      <MainMenu.Sub.Trigger
        icon={save}
        onSelect={
          editorInterface.formFactor !== "phone" ? runBackupNow : undefined
        }
      >
        Backups
      </MainMenu.Sub.Trigger>
      <MainMenu.Sub.Content>
        <MainMenu.Item icon={save} onSelect={runBackupNow}>
          Backup now
        </MainMenu.Item>
        <MainMenu.Item
          onSelect={(event) => startBackupSetup(excalidrawAPI, event)}
        >
          Change backup folder ({SUGGESTED_BACKUP_DIR})
        </MainMenu.Item>
        <MainMenu.Item
          onSelect={async () => {
            await disablePeriodicBackup();
          }}
        >
          Disable automatic backup
        </MainMenu.Item>
        <MainMenu.Separator />
        <MainMenu.Item disabled>
          Last backup: {formatLastBackup(backupStatus.lastBackupAt)}
        </MainMenu.Item>
      </MainMenu.Sub.Content>
    </MainMenu.Sub>
  );
};
