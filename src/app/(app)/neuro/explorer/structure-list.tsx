"use client";

import { useId, useState } from "react";

import { EXPLORER_MODES, type ExplorerItem, itemsForMode } from "@/lib/brain/catalog";

import { useExplorer, useExplorerStore } from "./explorer-context";

/** Mode switch: anatomy structures, or the reward circuit inside a see-through cortex. */
export function ModeSwitch() {
  const store = useExplorerStore();
  const mode = useExplorer((state) => state.mode);
  return (
    <fieldset className="inline-flex rounded-full border border-white/10 bg-[#0b1424]/85 p-1 shadow-xl backdrop-blur-md">
      <legend className="sr-only">What to show</legend>
      {EXPLORER_MODES.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={mode === option.id}
          onClick={() => store.setMode(option.id)}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
            mode === option.id ? "bg-white text-[#0b1424]" : "text-white/75 hover:bg-white/10"
          }`}
        >
          {option.label}
        </button>
      ))}
    </fieldset>
  );
}

function groupItems(items: readonly ExplorerItem[]): [string, ExplorerItem[]][] {
  const groups = new Map<string, ExplorerItem[]>();
  for (const item of items) groups.set(item.group, [...(groups.get(item.group) ?? []), item]);
  return [...groups.entries()];
}

/** Searchable, grouped list of the current mode's structures: the keyboard way to select. */
export function StructureList({ className = "" }: { className?: string }) {
  const store = useExplorerStore();
  const mode = useExplorer((state) => state.mode);
  const selected = useExplorer((state) => state.selected);
  const [query, setQuery] = useState("");
  const searchId = useId();
  const listLabel = EXPLORER_MODES.find((m) => m.id === mode)?.listLabel ?? "Brain structures";
  const needle = query.trim().toLowerCase();
  const items = itemsForMode(mode).filter((item) => item.name.toLowerCase().includes(needle));

  return (
    <nav aria-label={listLabel} className={className}>
      <h2 className="text-sm font-semibold text-white">{listLabel}</h2>
      <label htmlFor={searchId} className="sr-only">
        Search {listLabel.toLowerCase()}
      </label>
      <input
        id={searchId}
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search…"
        autoComplete="off"
        className="mt-2 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-white placeholder:text-white/40 focus-visible:outline-2 focus-visible:outline-sky-300"
      />
      {items.length === 0 && (
        <p className="mt-3 text-xs text-white/55">No structure matches “{query.trim()}”.</p>
      )}
      {groupItems(items).map(([group, groupItemsList]) => (
        <div key={group} className="mt-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-white/50">
            {group}
          </h3>
          <ul className="mt-1.5 grid gap-1">
            {groupItemsList.map((item) => {
              const isSelected = selected === item.slug;
              return (
                <li key={item.slug}>
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => store.select(isSelected ? null : item.slug)}
                    onMouseEnter={() => store.hover(item.slug)}
                    onMouseLeave={() => store.hover(null)}
                    onFocus={() => store.hover(item.slug)}
                    onBlur={() => store.hover(null)}
                    className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-sky-300 ${
                      isSelected
                        ? "bg-white/15 font-medium text-white"
                        : "text-white/80 hover:bg-white/10"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="min-w-0">{item.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
