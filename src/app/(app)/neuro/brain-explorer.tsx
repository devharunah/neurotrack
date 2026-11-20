"use client";

import { useProgress } from "@react-three/drei";
import dynamic from "next/dynamic";
import { Component, type ReactNode, useEffect, useState } from "react";

import { VIEW_SHORTCUTS } from "@/lib/brain/views";

import { CoachMark } from "./explorer/coach-mark";
import {
  ExplorerProvider,
  useDeepLink,
  useExplorer,
  useExplorerStore,
} from "./explorer/explorer-context";
import { GLASS, InfoPanel } from "./explorer/info-panel";
import { ModeSwitch, StructureList } from "./explorer/structure-list";
import { useIsDesktop, useIsWide } from "./explorer/use-media-query";
import { ViewerControls } from "./explorer/viewer-controls";
import { usePrefersReducedMotion, useWebglSupport } from "./use-client-env";

/** Widths (px) of the floating panels; the camera frames the brain in the space between. */
const LIST_WIDTH = 236;
const PANEL_WIDTH = 344;
const PANEL_MARGIN = 12;
/** Height (px) of the collapsed mobile sheet. */
const SHEET_PEEK = 136;

const STAGE_BACKGROUND =
  "bg-[radial-gradient(ellipse_at_50%_42%,_#1d2b44_0%,_#0d1729_58%,_#070d18_100%)]";

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

function RestartButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-white/25 px-4 py-1.5 text-white hover:bg-white/10"
    >
      {children}
    </button>
  );
}

/** Shows a retry message if the 3D scene throws (model failed to load, WebGL error). */
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
        <RestartButton onClick={this.props.onRetry}>Try again</RestartButton>
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

/** Esc deselects, R resets, Space pauses rotation, 0–7 switch views. */
function useKeyboardShortcuts() {
  const store = useExplorerStore();
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === "Escape") store.select(null);
      if (isTyping(event.target)) return;
      const view = VIEW_SHORTCUTS[event.key];
      if (view) store.setView(view);
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

function Caption({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <div className="space-y-1 text-xs leading-5 text-muted">
      <p>
        Drag to rotate, scroll or pinch to zoom, right-drag to pan. Keys: Esc clears, R resets,
        Space pauses, 1–7 change the view.
        {reducedMotion ? " Auto-rotation is off because your system asks for reduced motion." : ""}
      </p>
      <p>
        Brain model: Human Reference Atlas (HuBMAP), built from the Allen Human Reference Atlas, CC
        BY 4.0; modified for this explorer.{" "}
        <a className="underline hover:text-ink" href="/models/ATTRIBUTION.md">
          Attribution and changes
        </a>
      </p>
    </div>
  );
}

/** Collapsible mobile sheet for the selected structure's details. */
function MobileSheet({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 px-2 pb-2">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="mx-auto mb-1 flex h-7 items-center rounded-full bg-[#0b1424]/85 px-3 text-xs text-white/80 shadow backdrop-blur"
      >
        {expanded ? "Show less" : "Show more"}
      </button>
      <InfoPanel
        className={expanded ? "max-h-[72dvh] overflow-y-auto" : "max-h-[136px] overflow-hidden"}
      />
    </div>
  );
}

function DesktopListToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  if (open) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={true}
        aria-label="Hide the structure list"
        title="Hide list"
        className="absolute right-2 top-2 inline-flex size-7 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
      >
        <span aria-hidden="true">‹</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={false}
      className={`absolute left-3 top-3 z-10 rounded-full px-4 py-1.5 text-sm font-medium hover:bg-[#13213a] ${GLASS}`}
    >
      Structures ›
    </button>
  );
}

function ExplorerLayout() {
  const store = useExplorerStore();
  useDeepLink(store);
  useKeyboardShortcuts();
  const reducedMotion = usePrefersReducedMotion();
  const webgl = useWebglSupport();
  const isDesktop = useIsDesktop();
  const isWide = useIsWide();
  const [attempt, setAttempt] = useState(0);
  const [listChoice, setListChoice] = useState<boolean | null>(null);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [touched, setTouched] = useState(false);
  const mode = useExplorer((state) => state.mode);
  const selected = useExplorer((state) => state.selected);
  const modelReady = useExplorer((state) => state.modelReady);
  const contextLost = useExplorer((state) => state.contextLost);
  const listOpen = listChoice ?? isWide;

  // Tell the camera which parts of the stage the floating panels cover.
  useEffect(() => {
    store.setInsets(
      isDesktop
        ? {
            left: listOpen ? LIST_WIDTH + PANEL_MARGIN : 0,
            right: selected ? PANEL_WIDTH + PANEL_MARGIN : 0,
            bottom: 0,
          }
        : { left: 0, right: 0, bottom: selected && !sheetExpanded ? SHEET_PEEK : 0 },
    );
  }, [store, isDesktop, listOpen, selected, sheetExpanded]);

  // Until hydration settles WebGL support and the breakpoint, show one neutral placeholder,
  // so desktop users never see the mobile layout flash in first.
  if (webgl === "pending") {
    return (
      <div className="space-y-3">
        <ModeSwitch />
        <div
          className={`h-[62dvh] min-h-[380px] rounded-2xl lg:h-[calc(100dvh-17rem)] lg:min-h-[520px] ${STAGE_BACKGROUND}`}
        >
          <StageMessage>Loading 3D brain…</StageMessage>
        </div>
      </div>
    );
  }

  if (webgl === false) {
    return (
      <div className="space-y-4">
        <ModeSwitch />
        <WebglNotice />
        <StructureList className={`rounded-2xl p-4 ${GLASS}`} />
        <InfoPanel />
      </div>
    );
  }

  const restart = () => {
    store.setContextLost(false);
    setAttempt((n) => n + 1);
  };
  const coachSuppressed = touched || selected !== null;

  const stageContent = (
    <>
      <SceneBoundary key={attempt} onRetry={() => setAttempt((n) => n + 1)}>
        <Stage reducedMotion={reducedMotion} />
      </SceneBoundary>
      <LoadingIndicator />
      {contextLost && (
        <div className="absolute inset-0 z-20 bg-[#070d18]/80">
          <StageMessage>
            <p>The 3D view was paused because the browser reset its graphics.</p>
            <RestartButton onClick={restart}>Restart 3D view</RestartButton>
          </StageMessage>
        </div>
      )}
    </>
  );
  const stageProps = {
    "data-testid": "brain-canvas",
    "data-mode": mode,
    "data-ready": modelReady,
    onPointerDownCapture: () => setTouched(true),
  };

  if (isDesktop) {
    return (
      <div className="space-y-3">
        <ModeSwitch />
        <div
          {...stageProps}
          className={`relative h-[calc(100dvh-17rem)] min-h-[520px] touch-none overflow-hidden rounded-2xl ${STAGE_BACKGROUND}`}
        >
          {stageContent}
          {listOpen ? (
            <div
              className={`absolute bottom-20 left-3 top-3 z-10 overflow-y-auto rounded-2xl p-4 ${GLASS}`}
              style={{ width: LIST_WIDTH }}
            >
              <DesktopListToggle open onToggle={() => setListChoice(false)} />
              <StructureList />
            </div>
          ) : (
            <DesktopListToggle open={false} onToggle={() => setListChoice(true)} />
          )}
          <div
            className={`absolute right-3 top-3 z-10 ${selected ? "bottom-3" : ""}`}
            style={{ width: PANEL_WIDTH }}
          >
            <InfoPanel className={selected ? "h-full overflow-y-auto" : ""} />
          </div>
          <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex flex-col items-start gap-2">
            <CoachMark suppressed={coachSuppressed} />
            <div className="pointer-events-auto">
              <ViewerControls reducedMotion={reducedMotion} />
            </div>
          </div>
        </div>
        <Caption reducedMotion={reducedMotion} />
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${selected ? "pb-40" : ""}`}>
      <ModeSwitch />
      <div
        {...stageProps}
        className={`relative h-[62dvh] min-h-[380px] touch-none overflow-hidden rounded-2xl ${STAGE_BACKGROUND}`}
      >
        {stageContent}
        <div className="pointer-events-none absolute inset-x-2 bottom-3 z-10 flex flex-col items-center gap-2">
          <CoachMark suppressed={coachSuppressed} />
          <div className="pointer-events-auto max-w-full overflow-x-auto">
            <ViewerControls reducedMotion={reducedMotion} />
          </div>
        </div>
      </div>
      <Caption reducedMotion={reducedMotion} />
      <StructureList className={`rounded-2xl p-4 ${GLASS}`} />
      {!selected && <InfoPanel />}
      {selected && (
        <MobileSheet
          key={selected}
          expanded={sheetExpanded}
          onToggle={() => setSheetExpanded((open) => !open)}
        />
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
