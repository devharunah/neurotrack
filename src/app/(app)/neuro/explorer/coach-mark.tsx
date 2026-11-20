"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

const STORAGE_KEY = "neurotrack.brain-explorer.coach-dismissed.v1";

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false; // storage blocked (private mode, policy): just show the hint
  }
}

function writeDismissed(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // Not persisting is fine; the hint stays hidden for this page view.
  }
}

const noSubscribe = () => () => {};

/**
 * One-line, first-visit hint on how to use the 3D view. Never blocks the brain; hides once the
 * user interacts with the stage (`suppressed`) or dismisses it, and stays hidden on later visits.
 */
export function CoachMark({ suppressed }: { suppressed: boolean }) {
  // Server render and hydration treat it as dismissed, so it never flashes in and out.
  const dismissedBefore = useSyncExternalStore(noSubscribe, readDismissed, () => true);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    if (suppressed) writeDismissed();
  }, [suppressed]);

  if (dismissedBefore || closed || suppressed) return null;
  return (
    <output className="pointer-events-auto flex items-center gap-3 rounded-full border border-white/10 bg-[#0b1424]/85 py-1.5 pl-4 pr-1.5 text-xs text-white/85 shadow-xl backdrop-blur-md">
      <span>Drag to rotate · Scroll or pinch to zoom · Click a structure to explore it</span>
      <button
        type="button"
        onClick={() => {
          setClosed(true);
          writeDismissed();
        }}
        aria-label="Dismiss hint"
        className="inline-flex size-6 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
      >
        <span aria-hidden="true">×</span>
      </button>
    </output>
  );
}
