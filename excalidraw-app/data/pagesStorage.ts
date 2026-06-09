import { getNonDeletedElements } from "@excalidraw/element";
import { restoreAppState, restoreElements } from "@excalidraw/excalidraw/data/restore";

import type { ExcalidrawElement } from "@excalidraw/element/types";
import type {
  ExcalidrawImperativeAPI,
  PageSnapshot,
} from "@excalidraw/excalidraw/types";

import { STORAGE_KEYS } from "../app_constants";

export type PersistedPagesData = {
  pages: Array<{
    id: string;
    name: string;
    elements: readonly ExcalidrawElement[];
    appState: PageSnapshot["appState"];
  }>;
  activePageId: string;
};

export const savePagesToLocalStorage = (excalidrawAPI: ExcalidrawImperativeAPI) => {
  try {
    const data: PersistedPagesData = {
      pages: excalidrawAPI.getPageSnapshots().map((page) => ({
        id: page.id,
        name: page.name,
        elements: getNonDeletedElements(page.elements),
        appState: page.appState,
      })),
      activePageId: excalidrawAPI.getActivePageId(),
    };

    localStorage.setItem(
      STORAGE_KEYS.LOCAL_STORAGE_PAGES,
      JSON.stringify(data),
    );
  } catch (error) {
    console.error(error);
  }
};

export const importPagesFromLocalStorage = (): PersistedPagesData | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.LOCAL_STORAGE_PAGES);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as PersistedPagesData;
    if (!parsed?.pages?.length || !parsed.activePageId) {
      return null;
    }

    return {
      pages: parsed.pages.map((page) => ({
        id: page.id,
        name: page.name,
        elements: restoreElements(page.elements, null, {
          repairBindings: true,
          deleteInvisibleElements: true,
        }),
        appState: restoreAppState(page.appState, null) ?? page.appState,
      })),
      activePageId: parsed.activePageId,
    };
  } catch (error) {
    console.error(error);
    return null;
  }
};
