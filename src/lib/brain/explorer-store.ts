/**
 * State of the 3D brain explorer, as a tiny external store (read with useSyncExternalStore).
 *
 * The 3D scene reads it imperatively every frame, so animation never re-renders React; DOM
 * components subscribe to the slices they show. Camera moves that are not state (reset, zoom,
 * view changes) go out as commands to whoever drives the camera.
 */
import { type ExplorerMode, getExplorerItem } from "./catalog";
import { VIEW_PRESETS, type ViewPresetId } from "./views";

export interface ExplorerState {
  mode: ExplorerMode;
  selected: string | null;
  hovered: string | null;
  /** The user paused auto-rotation. */
  paused: boolean;
  /** Last view chosen from the view menu (or a deep link). */
  view: ViewPresetId;
  /** Hemisphere hidden for the inner-surface view. */
  hiddenSide: "lh" | "rh" | null;
  /** The 3D model has loaded and is on screen. */
  modelReady: boolean;
  /** Structures mode: show every structure in its colour instead of tissue colour. */
  atlasColors: boolean;
  /** The browser dropped the WebGL context (driver reset, GPU memory pressure). */
  contextLost: boolean;
  /** Pixels of the stage covered by floating panels, so the camera can frame around them. */
  insets: ScreenInsets;
}

export interface ScreenInsets {
  left: number;
  right: number;
  bottom: number;
}

export type CameraCommand =
  | { type: "reset" }
  | { type: "view"; view: ViewPresetId }
  | { type: "zoom"; direction: 1 | -1 };

export interface ExplorerStore {
  getState(): ExplorerState;
  subscribe(listener: () => void): () => void;
  onCommand(listener: (command: CameraCommand) => void): () => void;
  select(slug: string | null): void;
  hover(slug: string | null): void;
  setMode(mode: ExplorerMode): void;
  setPaused(paused: boolean): void;
  setModelReady(ready: boolean): void;
  setAtlasColors(on: boolean): void;
  setContextLost(lost: boolean): void;
  setInsets(insets: ScreenInsets): void;
  setView(view: ViewPresetId): void;
  zoom(direction: 1 | -1): void;
  reset(): void;
}

export const INITIAL_STATE: ExplorerState = {
  mode: "structures",
  selected: null,
  hovered: null,
  paused: false,
  view: "default",
  hiddenSide: null,
  modelReady: false,
  atlasColors: false,
  contextLost: false,
  insets: { left: 0, right: 0, bottom: 0 },
};

export function createExplorerStore(initial: Partial<ExplorerState> = {}): ExplorerStore {
  let state: ExplorerState = { ...INITIAL_STATE, ...initial };
  const listeners = new Set<() => void>();
  const commandListeners = new Set<(command: CameraCommand) => void>();

  const setState = (patch: Partial<ExplorerState>) => {
    const next = { ...state, ...patch };
    const changed = (Object.keys(patch) as (keyof ExplorerState)[]).some(
      (key) => next[key] !== state[key],
    );
    if (!changed) return;
    state = next;
    for (const listener of listeners) listener();
  };
  const send = (command: CameraCommand) => {
    for (const listener of commandListeners) listener(command);
  };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onCommand(listener) {
      commandListeners.add(listener);
      return () => commandListeners.delete(listener);
    },
    select(slug) {
      if (slug === null) {
        setState({ selected: null });
        return;
      }
      const item = getExplorerItem(state.mode, slug);
      if (!item) return;
      // The camera moves to the item's preferred view, which may need a hemisphere hidden; the
      // menu view no longer describes the camera, so it goes back to "default".
      setState({
        selected: slug,
        view: "default",
        hiddenSide: VIEW_PRESETS[item.view].hideSide ?? null,
      });
    },
    hover(slug) {
      setState({ hovered: slug });
    },
    setMode(mode) {
      // Keep the selection only if it exists in the new mode.
      const selected =
        state.selected && getExplorerItem(mode, state.selected) ? state.selected : null;
      setState({ mode, selected, hovered: null });
    },
    setPaused(paused) {
      setState({ paused });
    },
    setModelReady(modelReady) {
      setState({ modelReady });
    },
    setAtlasColors(atlasColors) {
      setState({ atlasColors });
    },
    setContextLost(contextLost) {
      setState({ contextLost });
    },
    setInsets(insets) {
      const { left, right, bottom } = state.insets;
      if (insets.left === left && insets.right === right && insets.bottom === bottom) return;
      setState({ insets: { ...insets } });
    },
    setView(view) {
      setState({ view, hiddenSide: VIEW_PRESETS[view].hideSide ?? null });
      send({ type: "view", view });
    },
    zoom(direction) {
      send({ type: "zoom", direction });
    },
    reset() {
      setState({ selected: null, hovered: null, view: "default", hiddenSide: null });
      send({ type: "reset" });
    },
  };
}
