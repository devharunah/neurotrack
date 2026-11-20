/**
 * What the 3D explorer shows in each mode: the selectable items, and how every model node is
 * drawn. Pure data derived from the content modules and the generated model manifest.
 */
import brainModel from "@/lib/content/brain-model.json";
import { BRAIN_REGIONS } from "@/lib/content/brain-regions";
import { BRAIN_STRUCTURES } from "@/lib/content/brain-structures";

import type { ViewPresetId } from "./views";

export type ExplorerMode = "structures" | "deep";

export const EXPLORER_MODES: readonly { id: ExplorerMode; label: string; listLabel: string }[] = [
  { id: "structures", label: "Structures", listLabel: "Brain structures" },
  { id: "deep", label: "Reward circuit", listLabel: "Deep structures" },
];

/**
 * How a model node is drawn in a mode.
 * - `pickable`: solid and clickable (an item of this mode)
 * - `context`: solid, not clickable (gives deep structures their surroundings)
 * - `ghost-item`: see-through outline tinted with its item's colour; selectable from the list
 * - `ghost`: see-through outline, not clickable
 * - `hidden`: not drawn
 */
export type NodeRole = "pickable" | "context" | "ghost-item" | "ghost" | "hidden";

export interface ExplorerItem {
  slug: string;
  name: string;
  kind: "structure" | "region";
  mode: ExplorerMode;
  /** Heading the item is listed under. */
  group: string;
  color: string;
  parts: readonly string[];
  /** Model node names (`lh_…`, `rh_…`, `mid_…`). */
  nodes: readonly string[];
  view: ViewPresetId;
  /** Set when the model shows only the location, not the boundary. */
  approximate?: string;
  /** Has a detail page at /neuro/regions/[slug]. */
  hasPage: boolean;
}

export interface ModelNode {
  part: string;
  side: string;
  group: string;
  surface: boolean;
  anchor: readonly number[];
}

export const MODEL_NODES: Readonly<Record<string, ModelNode>> = brainModel.nodes;

const NODES_BY_PART: ReadonlyMap<string, readonly string[]> = (() => {
  const byPart = new Map<string, string[]>();
  for (const [name, node] of Object.entries(MODEL_NODES)) {
    byPart.set(node.part, [...(byPart.get(node.part) ?? []), name]);
  }
  return byPart;
})();

export function nodesForParts(parts: readonly string[]): string[] {
  return parts.flatMap((part) => NODES_BY_PART.get(part) ?? []).sort();
}

/** Preferred camera view when an item is selected. */
const ITEM_VIEWS: Readonly<Record<string, ViewPresetId>> = {
  "frontal-lobe": "front-left",
  "parietal-lobe": "top-left",
  "temporal-lobe": "left",
  "occipital-lobe": "back-left",
  insula: "left",
  "limbic-lobe": "medial-left",
  cerebellum: "below-back-left",
  brainstem: "below-left",
  "corpus-callosum": "medial-left",
  "prefrontal-cortex": "front-left",
};

const STRUCTURE_GROUPS: Readonly<Record<string, string>> = {
  "frontal-lobe": "Cerebral cortex",
  "parietal-lobe": "Cerebral cortex",
  "temporal-lobe": "Cerebral cortex",
  "occipital-lobe": "Cerebral cortex",
  insula: "Cerebral cortex",
  "limbic-lobe": "Cerebral cortex",
  cerebellum: "Cerebellum and brainstem",
  brainstem: "Cerebellum and brainstem",
  "corpus-callosum": "Connections",
  thalamus: "Other deep structures",
  hypothalamus: "Other deep structures",
};

export const EXPLORER_ITEMS: readonly ExplorerItem[] = [
  ...BRAIN_STRUCTURES.filter((s) => s.explorer.mode === "structures").map(
    (s): ExplorerItem => ({
      slug: s.slug,
      name: s.name,
      kind: "structure",
      mode: "structures",
      group: STRUCTURE_GROUPS[s.slug] ?? "Other",
      color: s.explorer.color,
      parts: s.explorer.parts,
      nodes: nodesForParts(s.explorer.parts),
      view: ITEM_VIEWS[s.slug] ?? "default",
      hasPage: false,
    }),
  ),
  ...BRAIN_REGIONS.map(
    (r): ExplorerItem => ({
      slug: r.slug,
      name: r.name,
      kind: "region",
      mode: "deep",
      group: "Reward circuit",
      color: r.explorer.color,
      parts: r.explorer.parts,
      nodes: nodesForParts(r.explorer.parts),
      view: ITEM_VIEWS[r.slug] ?? "default",
      ...(r.explorer.approximate ? { approximate: r.explorer.approximate } : {}),
      hasPage: true,
    }),
  ),
  ...BRAIN_STRUCTURES.filter((s) => s.explorer.mode === "deep").map(
    (s): ExplorerItem => ({
      slug: s.slug,
      name: s.name,
      kind: "structure",
      mode: "deep",
      group: STRUCTURE_GROUPS[s.slug] ?? "Other",
      color: s.explorer.color,
      parts: s.explorer.parts,
      nodes: nodesForParts(s.explorer.parts),
      view: ITEM_VIEWS[s.slug] ?? "default",
      hasPage: false,
    }),
  ),
];

export function itemsForMode(mode: ExplorerMode): ExplorerItem[] {
  return EXPLORER_ITEMS.filter((item) => item.mode === mode);
}

export function getExplorerItem(mode: ExplorerMode, slug: string): ExplorerItem | undefined {
  return EXPLORER_ITEMS.find((item) => item.mode === mode && item.slug === slug);
}

/** Node name → the item it belongs to in a mode. */
export function nodeItemMap(mode: ExplorerMode): ReadonlyMap<string, ExplorerItem> {
  return new Map(itemsForMode(mode).flatMap((item) => item.nodes.map((n) => [n, item] as const)));
}

const CORTEX_GROUPS = new Set(["cortex"]);

export function nodeRole(mode: ExplorerMode, name: string): NodeRole {
  const node = MODEL_NODES[name];
  if (!node) {
    return "hidden";
  }
  const item = nodeItemMap(mode).get(name);
  if (mode === "structures") {
    if (item) return "pickable";
    return node.surface ? "context" : "hidden";
  }
  if (item) {
    // Cortex that belongs to a deep-mode item (the prefrontal cortex) would hide everything
    // behind it if it were solid, so it is drawn as a tinted outline instead.
    return CORTEX_GROUPS.has(node.group) ? "ghost-item" : "pickable";
  }
  return node.surface ? "ghost" : "context";
}

/** Role of every model node in a mode. */
export function nodeRoles(mode: ExplorerMode): ReadonlyMap<string, NodeRole> {
  return new Map(Object.keys(MODEL_NODES).map((name) => [name, nodeRole(mode, name)] as const));
}
