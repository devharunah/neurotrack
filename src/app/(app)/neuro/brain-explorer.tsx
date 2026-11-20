"use client";

import { type ReactNode, useEffect, useState } from "react";

import type { ExplorerStore } from "@/lib/brain/explorer-store";

import { CoachMark } from "./explorer/coach-mark";
import {
  ExplorerProvider,
  useDeepLink,
  useExplorer,
  useExplorerStore,
} from "./explorer/explorer-context";
import { GLASS, InfoPanel, SelectionAnnouncer } from "./explorer/info-panel";
import {
  Caption,
  ContextLostOverlay,
  DesktopListToggle,
  LoadingIndicator,
  MobileSheet,
  STAGE_BACKGROUND,
  SceneBoundary,
  Stage,
  StageMessage,
  WebglNotice,
  clearModelCache,
} from "./explorer/stage-chrome";
import { ModeSwitch, StructureList } from "./explorer/structure-list";
import { useKeyboardShortcuts } from "./explorer/use-keyboard-shortcuts";
import { useIsDesktop, useIsWide } from "./explorer/use-media-query";
import { ViewerControls } from "./explorer/viewer-controls";
import { usePrefersReducedMotion, useWebglSupport } from "./use-client-env";

/** Widths (px) of the floating panels; the camera frames the brain in the space between. */
const LIST_WIDTH = 236;
const PANEL_WIDTH = 344;
const PANEL_MARGIN = 12;
/** Height (px) of the collapsed mobile sheet. */
const SHEET_PEEK = 136;

/** The 3D stage itself plus its overlays, shared by the desktop and mobile layouts. */
function StageArea({
  reducedMotion,
  className,
  onTouched,
  children,
}: {
  reducedMotion: boolean;
  className: string;
  onTouched: () => void;
  children: ReactNode;
}) {
  const store = useExplorerStore();
  const [attempt, setAttempt] = useState(0);
  const mode = useExplorer((state) => state.mode);
  const modelReady = useExplorer((state) => state.modelReady);
  const contextLost = useExplorer((state) => state.contextLost);
  const retry = () => {
    store.setContextLost(false);
    void clearModelCache().finally(() => setAttempt((n) => n + 1));
  };

  return (
    <div
      data-testid="brain-canvas"
      data-mode={mode}
      data-ready={modelReady}
      onPointerDownCapture={onTouched}
      className={`relative touch-none overflow-hidden rounded-2xl ${STAGE_BACKGROUND} ${className}`}
    >
      <SceneBoundary key={attempt} onRetry={retry}>
        <Stage reducedMotion={reducedMotion} />
      </SceneBoundary>
      <LoadingIndicator />
      {contextLost && <ContextLostOverlay onRestart={retry} />}
      {children}
    </div>
  );
}

interface LayoutProps {
  store: ExplorerStore;
  reducedMotion: boolean;
  selected: string | null;
  coachSuppressed: boolean;
  onTouched: () => void;
}

function DesktopExplorer({
  store,
  reducedMotion,
  selected,
  coachSuppressed,
  onTouched,
}: LayoutProps) {
  const isWide = useIsWide();
  const [listChoice, setListChoice] = useState<boolean | null>(null);
  const listOpen = listChoice ?? isWide;

  // Tell the camera which parts of the stage the floating panels cover.
  useEffect(() => {
    store.setInsets({
      left: listOpen ? LIST_WIDTH + PANEL_MARGIN : 0,
      right: selected ? PANEL_WIDTH + PANEL_MARGIN : 0,
      bottom: 0,
    });
  }, [store, listOpen, selected]);

  return (
    <div className="space-y-3">
      <ModeSwitch />
      <StageArea
        reducedMotion={reducedMotion}
        onTouched={onTouched}
        className="h-[calc(100dvh-17rem)] min-h-[520px]"
      >
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
      </StageArea>
      <Caption reducedMotion={reducedMotion} />
    </div>
  );
}

function MobileExplorer({
  store,
  reducedMotion,
  selected,
  coachSuppressed,
  onTouched,
}: LayoutProps) {
  // Expanded for one selection only: a new selection starts collapsed again.
  const [expandedFor, setExpandedFor] = useState<string | null>(null);
  const expanded = selected !== null && expandedFor === selected;

  useEffect(() => {
    store.setInsets({ left: 0, right: 0, bottom: selected && !expanded ? SHEET_PEEK : 0 });
  }, [store, selected, expanded]);

  return (
    <div className={`space-y-3 ${selected ? "pb-40" : ""}`}>
      <ModeSwitch />
      <StageArea
        reducedMotion={reducedMotion}
        onTouched={onTouched}
        className="h-[62dvh] min-h-[380px]"
      >
        <div className="pointer-events-none absolute inset-x-2 bottom-3 z-10 flex flex-col items-center gap-2">
          <CoachMark suppressed={coachSuppressed} />
          <div className="pointer-events-auto max-w-full overflow-x-auto">
            <ViewerControls reducedMotion={reducedMotion} />
          </div>
        </div>
      </StageArea>
      <Caption reducedMotion={reducedMotion} />
      <StructureList className={`rounded-2xl p-4 ${GLASS}`} />
      {!selected && <InfoPanel />}
      {selected && (
        <MobileSheet
          expanded={expanded}
          onToggle={() => setExpandedFor(expanded ? null : selected)}
        />
      )}
    </div>
  );
}

function ExplorerLayout() {
  const store = useExplorerStore();
  const reducedMotion = usePrefersReducedMotion();
  const webgl = useWebglSupport();
  const isDesktop = useIsDesktop();
  const [touched, setTouched] = useState(false);
  const selected = useExplorer((state) => state.selected);
  useDeepLink(store);
  useKeyboardShortcuts(store, true);

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
        <SelectionAnnouncer />
        <ModeSwitch />
        <WebglNotice />
        <StructureList className={`rounded-2xl p-4 ${GLASS}`} />
        <InfoPanel />
      </div>
    );
  }

  const props: LayoutProps = {
    store,
    reducedMotion,
    selected,
    coachSuppressed: touched || selected !== null,
    onTouched: () => setTouched(true),
  };
  return (
    <>
      <SelectionAnnouncer />
      {isDesktop ? <DesktopExplorer {...props} /> : <MobileExplorer {...props} />}
    </>
  );
}

export function BrainExplorer() {
  return (
    <ExplorerProvider>
      <ExplorerLayout />
    </ExplorerProvider>
  );
}
