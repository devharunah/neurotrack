"use client";

import { useProgress } from "@react-three/drei";
import dynamic from "next/dynamic";
import { Component, type ReactNode } from "react";

import brainModel from "@/lib/content/brain-model.json";

import { GLASS, InfoPanel } from "./info-panel";

export const STAGE_BACKGROUND =
  "bg-[radial-gradient(ellipse_at_50%_42%,_#1d2b44_0%,_#0d1729_58%,_#070d18_100%)]";

export function StageMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-sm text-white/75">
      {children}
    </div>
  );
}

/** The WebGL scene, loaded on the client only. */
export const Stage = dynamic(() => import("./stage"), {
  ssr: false,
  loading: () => <StageMessage>Loading 3D brain…</StageMessage>,
});

export function RestartButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
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

/**
 * Forget a failed model download. The loader caches errors as well as results, so without
 * this a retry would rethrow the same error instead of downloading again. Imported lazily so
 * the glTF loader stays out of the page's initial JavaScript.
 */
export async function clearModelCache(): Promise<void> {
  const { useGLTF } = await import("@react-three/drei");
  useGLTF.clear(brainModel.model.file);
}

/** Shows a retry message if the 3D scene throws (model failed to load, WebGL error). */
export class SceneBoundary extends Component<
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

export function LoadingIndicator() {
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

export function ContextLostOverlay({ onRestart }: { onRestart: () => void }) {
  return (
    <div className="absolute inset-0 z-20 bg-[#070d18]/80">
      <StageMessage>
        <p>The 3D view was paused because the browser reset its graphics.</p>
        <RestartButton onClick={onRestart}>Restart 3D view</RestartButton>
      </StageMessage>
    </div>
  );
}

export function WebglNotice() {
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

export function Caption({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <div className="space-y-1 text-xs leading-5 text-ink-soft">
      <p>
        Drag to rotate, scroll or pinch to zoom, right-drag to pan. Keys: Esc clears, R resets,
        Space pauses, 1–7 change the view and 0 returns to the default view.
        {reducedMotion ? " Auto-rotation is off because your system asks for reduced motion." : ""}
      </p>
      <p>
        Brain model: Human Reference Atlas (HuBMAP; National Institute of Allergy and Infectious
        Diseases), built from the Allen Human Reference Atlas, CC BY 4.0; modified for this
        explorer.{" "}
        <a className="underline hover:text-ink" href="/models/ATTRIBUTION.md">
          Attribution and changes
        </a>
      </p>
    </div>
  );
}

/** Collapsible mobile sheet for the selected structure's details. */
export function MobileSheet({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
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

export function DesktopListToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
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
