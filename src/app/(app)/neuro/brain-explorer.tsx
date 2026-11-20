"use client";

import { useProgress } from "@react-three/drei";
import dynamic from "next/dynamic";
import { Component, type ReactNode, useEffect, useState } from "react";

import {
  ExplorerProvider,
  useDeepLink,
  useExplorer,
  useExplorerStore,
} from "./explorer/explorer-context";
import { InfoPanel } from "./explorer/info-panel";
import { ModeSwitch, StructureList } from "./explorer/structure-list";
import { ViewerControls } from "./explorer/viewer-controls";
import { usePrefersReducedMotion, useWebglSupport } from "./use-client-env";

function StageMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-sm text-white/75">
      {children}
    </div>
  );
}

const Stage = dynamic(() => import("./explorer/stage"), {
  ssr: false,
  loading: () => <StageMessage>Loading 3D brain…</StageMessage>,
});

/** Shows a retry message if the 3D scene throws (model failed to load, lost WebGL context). */
class SceneBoundary extends Component<
  { onRetry: () => void; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <StageMessage>
        <p>The 3D view could not start. Every structure is still available from the list.</p>
        <button
          type="button"
          onClick={this.props.onRetry}
          className="rounded-full border border-white/25 px-4 py-1.5 text-white hover:bg-white/10"
        >
          Try again
        </button>
      </StageMessage>
    );
  }
}

function LoadingIndicator() {
  const { active, progress } = useProgress();
  if (!active) return null;
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-white/10"
      aria-hidden="true"
    >
      <div className="h-full bg-sky-300/80 transition-[width]" style={{ width: `${progress}%` }} />
    </div>
  );
}

function WebglNotice() {
  return (
    <p
      className="rounded-xl border border-line bg-card p-4 text-sm leading-6 text-ink-soft"
      data-testid="webgl-fallback"
    >
      3D graphics (WebGL) are not available in this browser, so the brain model is hidden. Every
      structure is still available from the list.
    </p>
  );
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"].includes(target.tagName))
  );
}

/** Esc deselects, R resets the view, Space pauses or resumes rotation. */
function useKeyboardShortcuts() {
  const store = useExplorerStore();
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === "Escape") store.select(null);
      if (isTyping(event.target)) return;
      if (event.key === "r" || event.key === "R") store.reset();
      if (event.key === " ") {
        event.preventDefault();
        store.setPaused(!store.getState().paused);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [store]);
}

function ExplorerLayout() {
  const store = useExplorerStore();
  useDeepLink(store);
  useKeyboardShortcuts();
  const reducedMotion = usePrefersReducedMotion();
  const webgl = useWebglSupport();
  const [attempt, setAttempt] = useState(0);
  const mode = useExplorer((state) => state.mode);
  const modelReady = useExplorer((state) => state.modelReady);

  const sidebar = (
    <div className="space-y-5">
      <StructureList />
      <InfoPanel />
    </div>
  );

  return (
    <div className="space-y-4">
      <ModeSwitch />
      {webgl === false ? (
        <div className="space-y-4">
          <WebglNotice />
          {sidebar}
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0">
            <div
              className="relative h-[420px] touch-none overflow-hidden rounded-2xl bg-[radial-gradient(ellipse_at_50%_42%,_#1d2b44_0%,_#0d1729_58%,_#070d18_100%)] sm:h-[540px] lg:h-[min(74vh,720px)]"
              data-testid="brain-canvas"
              data-mode={mode}
              data-ready={modelReady}
            >
              <SceneBoundary key={attempt} onRetry={() => setAttempt((n) => n + 1)}>
                {webgl === "pending" ? (
                  <StageMessage>Loading 3D brain…</StageMessage>
                ) : (
                  <Stage reducedMotion={reducedMotion} />
                )}
              </SceneBoundary>
              <LoadingIndicator />
              <div className="absolute inset-x-0 bottom-3 flex justify-center px-3">
                <ViewerControls reducedMotion={reducedMotion} />
              </div>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted">
              Drag to rotate, scroll or pinch to zoom, right-drag to pan. Esc clears the selection,
              R resets the view.
              {reducedMotion
                ? " Auto-rotation is off because your system asks for reduced motion."
                : ""}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted">
              Brain model: Human Reference Atlas (HuBMAP), built from the Allen Human Reference
              Atlas, CC BY 4.0; modified for this explorer.{" "}
              <a className="underline hover:text-ink" href="/models/ATTRIBUTION.md">
                Attribution and changes
              </a>
            </p>
          </div>
          {sidebar}
        </div>
      )}
    </div>
  );
}

export function BrainExplorer() {
  return (
    <ExplorerProvider>
      <ExplorerLayout />
    </ExplorerProvider>
  );
}
