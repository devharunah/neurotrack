"use client";

import { EXPLORER_MODES, type ExplorerItem, itemsForMode } from "@/lib/brain/catalog";

import { useExplorer, useExplorerStore } from "./explorer-context";

/** Mode switch: anatomy structures, or the reward circuit inside a see-through cortex. */
export function ModeSwitch() {
  const store = useExplorerStore();
  const mode = useExplorer((state) => state.mode);
  return (
    <fieldset className="inline-flex rounded-full border border-line bg-card p-1 shadow-sm">
      <legend className="sr-only">What to show</legend>
      {EXPLORER_MODES.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={mode === option.id}
          onClick={() => store.setMode(option.id)}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            mode === option.id ? "bg-ink text-white" : "text-ink-soft hover:bg-paper"
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

/** Keyboard-accessible equivalent of clicking the model. */
export function StructureList() {
  const store = useExplorerStore();
  const mode = useExplorer((state) => state.mode);
  const selected = useExplorer((state) => state.selected);
  const listLabel = EXPLORER_MODES.find((m) => m.id === mode)?.listLabel ?? "Brain structures";

  return (
    <nav aria-label={listLabel}>
      <h2 className="text-sm font-semibold">{listLabel}</h2>
      {groupItems(itemsForMode(mode)).map(([group, items]) => (
        <div key={group} className="mt-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted">{group}</h3>
          <ul className="mt-1.5 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-1">
            {items.map((item) => {
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
                    className={`flex w-full items-center gap-2 rounded-lg border px-3 py-1.5 text-left text-sm transition-colors ${
                      isSelected
                        ? "border-neuro bg-neuro-soft font-medium text-neuro"
                        : "border-line bg-card hover:bg-paper"
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
