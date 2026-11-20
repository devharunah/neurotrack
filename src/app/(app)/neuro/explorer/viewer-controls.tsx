"use client";

import { MENU_VIEWS, VIEW_PRESETS, isViewPresetId } from "@/lib/brain/views";

import { useExplorer, useExplorerStore } from "./explorer-context";
import { PauseIcon, PlayIcon, ResetIcon, ZoomInIcon, ZoomOutIcon } from "./icons";

const BUTTON =
  "inline-flex size-9 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

/** Floating control pill at the bottom of the stage. */
export function ViewerControls({ reducedMotion }: { reducedMotion: boolean }) {
  const store = useExplorerStore();
  const paused = useExplorer((state) => state.paused);
  const view = useExplorer((state) => state.view);
  const rotating = !paused && !reducedMotion;

  return (
    <div
      role="toolbar"
      aria-label="3D view controls"
      className="flex items-center gap-1 rounded-full border border-white/10 bg-[#0b1424]/80 p-1 shadow-xl backdrop-blur"
    >
      <button
        type="button"
        className={BUTTON}
        onClick={store.reset}
        title="Reset view (R)"
        aria-label="Reset view"
      >
        <ResetIcon />
      </button>
      <button
        type="button"
        className={BUTTON}
        onClick={() => store.setPaused(!paused)}
        disabled={reducedMotion}
        title={
          reducedMotion
            ? "Auto-rotation is off because your system asks for reduced motion"
            : rotating
              ? "Pause rotation (Space)"
              : "Resume rotation (Space)"
        }
        aria-label={rotating ? "Pause rotation" : "Resume rotation"}
      >
        {rotating ? <PauseIcon /> : <PlayIcon />}
      </button>
      <button
        type="button"
        className={BUTTON}
        onClick={() => store.zoom(1)}
        title="Zoom in"
        aria-label="Zoom in"
      >
        <ZoomInIcon />
      </button>
      <button
        type="button"
        className={BUTTON}
        onClick={() => store.zoom(-1)}
        title="Zoom out"
        aria-label="Zoom out"
      >
        <ZoomOutIcon />
      </button>
      <label className="ml-1 flex items-center pr-1">
        <span className="sr-only">Camera view</span>
        <select
          value={view}
          onChange={(event) => {
            if (isViewPresetId(event.target.value)) store.setView(event.target.value);
          }}
          className="h-9 cursor-pointer rounded-full border border-white/15 bg-transparent px-3 text-sm text-white/90 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white"
        >
          {MENU_VIEWS.map((id) => (
            <option key={id} value={id} className="bg-[#0b1424] text-white">
              {VIEW_PRESETS[id].label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
