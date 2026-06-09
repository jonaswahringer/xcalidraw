import { nanoid } from "nanoid";

import {
  clearAppStateForLocalStorage,
  getDefaultAppState,
} from "./appState";

import type { AppState, PageSnapshot } from "./types";

export const createEmptyPage = (name: string, id?: string): PageSnapshot => ({
  id: id ?? nanoid(),
  name,
  elements: [],
  appState: clearAppStateForLocalStorage(getDefaultAppState()),
});

export const snapshotPageAppState = (appState: AppState): Partial<AppState> =>
  clearAppStateForLocalStorage(appState);

export const getPageAppStateForRestore = (
  pageAppState: Partial<AppState>,
  currentAppState: AppState,
): Partial<AppState> => ({
  ...pageAppState,
  selectedElementIds: {},
  selectedGroupIds: {},
  previousSelectedElementIds: {},
  editingTextElement: null,
  editingGroupId: null,
  newElement: null,
  multiElement: null,
  openDialog: null,
  contextMenu: null,
  openPopup: null,
  selectionElement: null,
  selectedElementsAreBeingDragged: false,
  isResizing: false,
  isRotating: false,
  resizingElement: null,
  frameToHighlight: null,
  editingFrame: null,
  theme: currentAppState.theme,
  width: currentAppState.width,
  height: currentAppState.height,
  offsetTop: currentAppState.offsetTop,
  offsetLeft: currentAppState.offsetLeft,
  collaborators: currentAppState.collaborators,
  followedBy: currentAppState.followedBy,
  userToFollow: currentAppState.userToFollow,
  isLoading: false,
  toast: currentAppState.toast,
  viewModeEnabled: currentAppState.viewModeEnabled,
  zenModeEnabled: currentAppState.zenModeEnabled,
});
