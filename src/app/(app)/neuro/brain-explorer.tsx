"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Component, type ReactNode, useState } from "react";

import { BRAIN_REGIONS, getBrainRegion, regionSummary } from "@/lib/content/brain-regions";

import { usePrefersReducedMotion, useWebglSupport } from "./use-client-env";

function CanvasPlaceholder({ text }: { text: string }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-white/70">{text}</div>
  );
}

const BrainCanvas = dynamic(() => import("./brain-canvas"), {
  ssr: false,
  loading: () => <CanvasPlaceholder text="Loading 3D brain…" />,
});

/** Falls back to the region list if the 3D scene throws (for example, a lost WebGL context). */
class SceneBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function WebglNotice() {
  return (
    <p
      className="rounded-xl border border-line bg-card p-4 text-sm leading-6 text-ink-soft"
      data-testid="webgl-fallback"
    >
      3D graphics (WebGL) are not available in this browser, so the brain model is hidden. Every
      region is still available from the list.
    </p>
  );
}

function RegionList({
  selected,
  onSelect,
  onHover,
}: {
  selected: string | null;
  onSelect: (slug: string) => void;
  onHover: (slug: string | null) => void;
}) {
  return (
    <nav aria-label="Brain regions">
      <h2 className="text-sm font-semibold">Regions</h2>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
        {BRAIN_REGIONS.map((region) => {
          const isSelected = selected === region.slug;
          return (
            <li key={region.slug}>
              <button
                type="button"
                aria-pressed={isSelected}
                onClick={() => onSelect(region.slug)}
                onMouseEnter={() => onHover(region.slug)}
                onMouseLeave={() => onHover(null)}
                onFocus={() => onHover(region.slug)}
                onBlur={() => onHover(null)}
                className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                  isSelected
                    ? "border-neuro bg-neuro-soft font-medium text-neuro"
                    : "border-line bg-card hover:bg-paper"
                }`}
              >
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: region.explorer.color }}
                />
                <span className="min-w-0">{region.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function RegionPanel({ slug }: { slug: string | null }) {
  const region = slug ? getBrainRegion(slug) : undefined;
  return (
    <section
      aria-labelledby="region-panel-heading"
      aria-live="polite"
      className="rounded-2xl border border-line bg-card p-5"
      data-testid="region-panel"
    >
      {region ? (
        <>
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-3 shrink-0 rounded-full"
              style={{ backgroundColor: region.explorer.color }}
            />
            <h2 id="region-panel-heading" className="font-semibold">
              {region.name}
            </h2>
            <span className="rounded bg-neuro-soft px-1.5 py-0.5 font-mono text-[11px] text-neuro">
              {region.abbreviation}
            </span>
          </div>
          <p className="mt-3 text-sm leading-6 text-ink-soft">{regionSummary(region)}</p>
          <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">
            Primary functions
          </h3>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm leading-6 text-ink-soft">
            {region.primaryFunctions.slice(0, 3).map((fn) => (
              <li key={fn}>{fn}</li>
            ))}
          </ul>
          <Link
            href={`/neuro/regions/${region.slug}`}
            className="mt-4 inline-block text-sm font-medium text-neuro hover:underline"
          >
            Read more about the {region.name.toLowerCase()} →
          </Link>
        </>
      ) : (
        <>
          <h2 id="region-panel-heading" className="font-semibold">
            Pick a region
          </h2>
          <p className="mt-2 text-sm leading-6 text-ink-soft">
            Click a glowing region in the model, or choose one from the list, to see a summary and
            its sourced references.
          </p>
        </>
      )}
    </section>
  );
}

export function BrainExplorer() {
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const webgl = useWebglSupport();

  const sidebar = (
    <div className="space-y-4">
      <RegionList selected={selected} onSelect={setSelected} onHover={setHovered} />
      <RegionPanel slug={selected} />
    </div>
  );

  if (webgl === false) {
    return (
      <div className="space-y-4">
        <WebglNotice />
        {sidebar}
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">
        <div
          className="relative h-[340px] overflow-hidden rounded-2xl bg-[radial-gradient(ellipse_at_center,_#1e2c44_0%,_#0f1b2d_70%)] sm:h-[460px] lg:h-[560px]"
          data-testid="brain-canvas"
        >
          <SceneBoundary fallback={<CanvasPlaceholder text="The 3D view could not start." />}>
            {webgl === "pending" ? (
              <CanvasPlaceholder text="Loading 3D brain…" />
            ) : (
              <BrainCanvas
                selected={selected}
                hovered={hovered}
                reducedMotion={reducedMotion}
                onSelect={setSelected}
                onHover={setHovered}
              />
            )}
          </SceneBoundary>
        </div>
        <p className="mt-2 text-xs leading-5 text-muted">
          Schematic model: shapes and positions are approximate and for orientation only. Bilateral
          structures appear in both hemispheres. Drag to rotate, scroll or pinch to zoom.
          {reducedMotion
            ? " Auto-rotation is off because your system asks for reduced motion."
            : ""}
        </p>
      </div>
      {sidebar}
    </div>
  );
}
