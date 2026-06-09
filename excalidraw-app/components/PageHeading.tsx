import { KEYS } from "@excalidraw/common";
import { Island } from "@excalidraw/excalidraw/components/Island";
import { useUIAppState } from "@excalidraw/excalidraw/context/ui-appState";
import { useTunnels } from "@excalidraw/excalidraw/context/tunnels";
import { useCallback, useEffect, useRef, useState } from "react";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { savePagesToLocalStorage } from "../data/pagesStorage";

import "./PageHeading.scss";

export const PageHeading = ({
  excalidrawAPI,
}: {
  excalidrawAPI: ExcalidrawImperativeAPI | null;
}) => {
  const { ToolbarHeadingTunnel } = useTunnels();
  const appState = useUIAppState();
  const inputRef = useRef<HTMLInputElement>(null);

  const [pageName, setPageName] = useState("Page 1");
  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState("");

  const refreshPageName = useCallback(() => {
    if (!excalidrawAPI) {
      setPageName("Page 1");
      return;
    }

    const activePageId = excalidrawAPI.getActivePageId();
    const activePage = excalidrawAPI
      .getPages()
      .find((page) => page.id === activePageId);
    setPageName(activePage?.name ?? "Page 1");
  }, [excalidrawAPI]);

  useEffect(() => {
    refreshPageName();
  }, [refreshPageName]);

  useEffect(() => {
    if (!excalidrawAPI) {
      return;
    }

    const unsubPages = excalidrawAPI.onPagesChange(refreshPageName);
    const unsubChange = excalidrawAPI.onChange(refreshPageName);

    return () => {
      unsubPages();
      unsubChange();
    };
  }, [excalidrawAPI, refreshPageName]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  if (
    !excalidrawAPI ||
    appState.viewModeEnabled ||
    appState.zenModeEnabled ||
    appState.openDialog?.name === "elementLinkSelector"
  ) {
    return null;
  }

  const commitRename = () => {
    const trimmed = draftName.trim();
    setIsEditing(false);

    if (!trimmed || trimmed === pageName) {
      return;
    }

    excalidrawAPI.renamePage(excalidrawAPI.getActivePageId(), trimmed);
    savePagesToLocalStorage(excalidrawAPI);
    refreshPageName();
  };

  const startEditing = () => {
    setDraftName(pageName);
    setIsEditing(true);
  };

  return (
    <ToolbarHeadingTunnel.In>
      <div className="excalidraw-app-page-heading">
        <Island padding={0.35} className="excalidraw-app-page-heading__island">
          {isEditing ? (
            <input
              ref={inputRef}
              className="excalidraw-app-page-heading__input"
              value={draftName}
              aria-label="Page name"
              onChange={(event) => setDraftName(event.target.value)}
              onBlur={commitRename}
              onKeyDown={(event) => {
                if (event.key === KEYS.ESCAPE) {
                  event.preventDefault();
                  setIsEditing(false);
                  return;
                }
                if (event.key === KEYS.ENTER) {
                  event.preventDefault();
                  commitRename();
                }
              }}
            />
          ) : (
            <button
              type="button"
              className="excalidraw-app-page-heading__button"
              onClick={startEditing}
              title="Click to rename page"
            >
              {pageName}
            </button>
          )}
        </Island>
      </div>
    </ToolbarHeadingTunnel.In>
  );
};
