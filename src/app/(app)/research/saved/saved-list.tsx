"use client";

import { useState } from "react";

import type { SavedReference } from "@/lib/research/server";

import { ReferenceCard } from "../reference-card";
import { EmptyState } from "../ui";

const dateFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" });

export function SavedList({ initial }: { initial: SavedReference[] }) {
  const [items, setItems] = useState(initial);

  if (items.length === 0) {
    return <EmptyState>You have removed everything from this list.</EmptyState>;
  }

  return (
    <>
      <p className="text-sm text-muted">
        {items.length} saved {items.length === 1 ? "reference" : "references"}
      </p>
      <ul className="space-y-3" data-testid="saved-references">
        {items.map((item) => (
          <li key={item.saved?.id ?? item.cacheId}>
            <ReferenceCard
              reference={item}
              footnote={`Saved ${dateFormat.format(new Date(item.savedAt))}`}
              onUnsaved={() =>
                setItems((current) => current.filter((other) => other.cacheId !== item.cacheId))
              }
            />
          </li>
        ))}
      </ul>
    </>
  );
}
