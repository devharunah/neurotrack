"use client";

import { useEffect } from "react";

import type { ExplorerStore } from "@/lib/brain/explorer-store";
import { VIEW_SHORTCUTS } from "@/lib/brain/views";

/** Text entry: every shortcut is off so typing a "1" or "r" never moves the camera. */
function isTextEntry(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

/** Space activates a focused button or link, so it is only a shortcut elsewhere. */
function isActivatable(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && ["BUTTON", "A"].includes(target.tagName);
}

/**
 * Esc clears the selection, R resets the view, 0–7 change the view and Space pauses rotation.
 * Space only counts when focus is on the page itself or inside the 3D stage, so it still
 * scrolls and still activates buttons everywhere else.
 */
export function useKeyboardShortcuts(store: ExplorerStore, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === "Escape") store.select(null);
      if (isTextEntry(event.target)) return;
      const view = VIEW_SHORTCUTS[event.key];
      if (view) store.setView(view);
      if (event.key === "r" || event.key === "R") store.reset();
      const onStage =
        event.target === document.body ||
        (event.target instanceof Element && event.target.closest('[data-testid="brain-canvas"]'));
      if (event.key === " " && onStage && !isActivatable(event.target)) {
        event.preventDefault();
        store.setPaused(!store.getState().paused);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [store, enabled]);
}
