import { MainMenu } from "@excalidraw/excalidraw/index";
import { file, PlusIcon } from "@excalidraw/excalidraw/components/icons";
import { useCallback, useEffect, useState } from "react";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { savePagesToLocalStorage } from "../data/pagesStorage";

export const DocsMenu = ({
  excalidrawAPI,
}: {
  excalidrawAPI: ExcalidrawImperativeAPI | null;
}) => {
  const [pages, setPages] = useState<{ id: string; name: string }[]>([]);
  const [activePageId, setActivePageId] = useState("");

  const refreshPages = useCallback(() => {
    if (!excalidrawAPI) {
      setPages([]);
      setActivePageId("");
      return;
    }

    setPages(excalidrawAPI.getPages());
    setActivePageId(excalidrawAPI.getActivePageId());
  }, [excalidrawAPI]);

  useEffect(() => {
    refreshPages();
  }, [refreshPages]);

  useEffect(() => {
    if (!excalidrawAPI) {
      return;
    }

    const unsubPages = excalidrawAPI.onPagesChange(refreshPages);
    const unsubChange = excalidrawAPI.onChange(refreshPages);

    return () => {
      unsubPages();
      unsubChange();
    };
  }, [excalidrawAPI, refreshPages]);

  if (!excalidrawAPI) {
    return null;
  }

  const handleSwitchPage = (pageId: string) => {
    if (pageId === activePageId) {
      return;
    }
    excalidrawAPI.switchPage(pageId);
    savePagesToLocalStorage(excalidrawAPI);
    refreshPages();
  };

  const handleCreatePage = () => {
    excalidrawAPI.createPage();
    savePagesToLocalStorage(excalidrawAPI);
    refreshPages();
  };

  return (
    <MainMenu.Sub>
      <MainMenu.Sub.Trigger icon={file}>Docs</MainMenu.Sub.Trigger>
      <MainMenu.Sub.Content>
        {pages.map((page) => (
          <MainMenu.Item
            key={page.id}
            selected={page.id === activePageId}
            onSelect={() => handleSwitchPage(page.id)}
          >
            {page.name}
          </MainMenu.Item>
        ))}
        <MainMenu.Separator />
        <MainMenu.Item icon={PlusIcon} onSelect={handleCreatePage}>
          New page
        </MainMenu.Item>
      </MainMenu.Sub.Content>
    </MainMenu.Sub>
  );
};
