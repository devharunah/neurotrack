"use client";

import Link from "next/link";

import { EXPLORER_ITEMS, type ExplorerItem, getExplorerItem } from "@/lib/brain/catalog";
import {
  type Reference,
  doiUrl,
  formatReference,
  getBrainRegion,
  pubmedUrl,
  regionSummary,
} from "@/lib/content/brain-regions";
import { getBrainStructure } from "@/lib/content/brain-structures";

import { useExplorer, useExplorerStore } from "./explorer-context";

const SECTION = "mt-4 text-xs font-semibold uppercase tracking-wide text-muted";

function References({ references }: { references: readonly Reference[] }) {
  return (
    <>
      <h3 className={SECTION}>References</h3>
      <ul className="mt-1.5 space-y-2 text-xs leading-5 text-ink-soft">
        {references.map((ref) => (
          <li key={ref.doi}>
            {formatReference(ref)}{" "}
            <a
              className="text-neuro hover:underline"
              href={doiUrl(ref.doi)}
              target="_blank"
              rel="noreferrer"
            >
              DOI
            </a>
            {ref.pmid && (
              <>
                {" · "}
                <a
                  className="text-neuro hover:underline"
                  href={pubmedUrl(ref.pmid)}
                  target="_blank"
                  rel="noreferrer"
                >
                  PubMed
                </a>
              </>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

function Related({ slugs }: { slugs: readonly string[] }) {
  const store = useExplorerStore();
  const items = slugs.flatMap((slug) => EXPLORER_ITEMS.filter((item) => item.slug === slug));
  if (items.length === 0) return null;
  return (
    <>
      <h3 className={SECTION}>Related</h3>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {items.map((item) => (
          <li key={item.slug}>
            <button
              type="button"
              onClick={() => {
                store.setMode(item.mode);
                store.select(item.slug);
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs hover:bg-paper"
            >
              <span
                aria-hidden="true"
                className="size-2 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              {item.name}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function Heading({
  item,
  category,
  abbreviation,
}: { item: ExplorerItem; category: string; abbreviation?: string }) {
  return (
    <>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{category}</p>
      <div className="mt-1 flex items-center gap-2">
        <span
          aria-hidden="true"
          className="size-3 shrink-0 rounded-full"
          style={{ backgroundColor: item.color }}
        />
        <h2 id="region-panel-heading" className="text-lg font-semibold leading-tight">
          {item.name}
        </h2>
        {abbreviation && (
          <span className="rounded bg-neuro-soft px-1.5 py-0.5 font-mono text-[11px] text-neuro">
            {abbreviation}
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-muted">
        {item.nodes.some((n) => n.startsWith("mid_")) ? "Midline" : "Both hemispheres"}
      </p>
    </>
  );
}

function RegionDetails({ item }: { item: ExplorerItem }) {
  const region = getBrainRegion(item.slug);
  if (!region) return null;
  return (
    <>
      <Heading item={item} category="Reward circuit" abbreviation={region.abbreviation} />
      {item.approximate && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-warn-soft px-3 py-2 text-xs leading-5 text-warn">
          <strong className="font-semibold">Approximate location.</strong> {item.approximate}
        </p>
      )}
      <p className="mt-3 text-sm leading-6 text-ink-soft">{regionSummary(region)}</p>
      <h3 className={SECTION}>Primary functions</h3>
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
  );
}

function StructureDetails({ item }: { item: ExplorerItem }) {
  const structure = getBrainStructure(item.slug);
  if (!structure) return null;
  return (
    <>
      <Heading item={item} category={structure.category} />
      <h3 className={SECTION}>Location</h3>
      <p className="mt-1.5 text-sm leading-6 text-ink-soft">{structure.location}</p>
      <h3 className={SECTION}>Primary functions</h3>
      <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm leading-6 text-ink-soft">
        {structure.primaryFunctions.map((fn) => (
          <li key={fn}>{fn}</li>
        ))}
      </ul>
      <h3 className={SECTION}>Associated processes</h3>
      <p className="mt-1.5 text-sm leading-6 text-ink-soft">{structure.associatedProcesses}</p>
      {structure.addictionResearch && (
        <>
          <h3 className={SECTION}>In addiction research</h3>
          <p className="mt-1.5 text-sm leading-6 text-ink-soft">{structure.addictionResearch}</p>
        </>
      )}
      <Related slugs={structure.related} />
      <References references={structure.references} />
    </>
  );
}

function Welcome() {
  const store = useExplorerStore();
  const start = (slug: string) => {
    const item = EXPLORER_ITEMS.find((candidate) => candidate.slug === slug);
    if (!item) return;
    store.setMode(item.mode);
    store.select(slug);
  };
  return (
    <>
      <h2 id="region-panel-heading" className="text-lg font-semibold">
        Explore the brain
      </h2>
      <p className="mt-2 text-sm leading-6 text-ink-soft">
        Drag to rotate, scroll or pinch to zoom, and click a structure to learn what it does. Switch
        to <strong className="font-medium">Reward circuit</strong> to see the structures that
        research on reward and addiction returns to, inside a see-through brain.
      </p>
      <h3 className={SECTION}>Start with</h3>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {["frontal-lobe", "cerebellum", "nucleus-accumbens"].map((slug) => {
          const item = EXPLORER_ITEMS.find((candidate) => candidate.slug === slug);
          return item ? (
            <li key={slug}>
              <button
                type="button"
                onClick={() => start(slug)}
                className="rounded-full border border-line px-3 py-1 text-xs font-medium hover:bg-paper"
              >
                {item.name}
              </button>
            </li>
          ) : null;
        })}
      </ul>
    </>
  );
}

export function InfoPanel() {
  const mode = useExplorer((state) => state.mode);
  const selected = useExplorer((state) => state.selected);
  const item = selected ? getExplorerItem(mode, selected) : undefined;

  return (
    <section
      aria-labelledby="region-panel-heading"
      aria-live="polite"
      className="rounded-2xl border border-line bg-card p-5"
      data-testid="region-panel"
    >
      {!item && <Welcome />}
      {item?.kind === "region" && <RegionDetails item={item} />}
      {item?.kind === "structure" && <StructureDetails item={item} />}
    </section>
  );
}
