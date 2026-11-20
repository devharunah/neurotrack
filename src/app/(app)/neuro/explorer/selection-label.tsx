"use client";

import { Html } from "@react-three/drei";

import { MODEL_NODES, getExplorerItem } from "@/lib/brain/catalog";

import { useExplorer } from "./explorer-context";

/** Name tag pinned to the selected structure (at its pipeline-computed anchor point). */
export function SelectionLabel() {
  const mode = useExplorer((state) => state.mode);
  const selected = useExplorer((state) => state.selected);
  const hiddenSide = useExplorer((state) => state.hiddenSide);
  const item = selected ? getExplorerItem(mode, selected) : undefined;
  if (!item) return null;

  const visible = item.nodes.filter((name) => !hiddenSide || !name.startsWith(`${hiddenSide}_`));
  const nodeName = visible.find((name) => name.startsWith("lh_")) ?? visible[0];
  const anchor = nodeName ? MODEL_NODES[nodeName]?.anchor : undefined;
  if (!anchor || anchor.length !== 3) return null;

  return (
    <Html
      position={[anchor[0] ?? 0, anchor[1] ?? 0, anchor[2] ?? 0]}
      style={{ pointerEvents: "none" }}
      zIndexRange={[20, 0]}
    >
      <div className="flex -translate-x-1.5 -translate-y-1.5 items-center gap-2" aria-hidden="true">
        <span
          className="size-3 shrink-0 rounded-full border-2 border-white/90 shadow-[0_0_12px_rgba(255,255,255,0.6)]"
          style={{ backgroundColor: item.color }}
        />
        <span className="h-px w-6 bg-white/60" />
        <span className="whitespace-nowrap rounded-md border border-white/15 bg-[#0b1424]/85 px-2.5 py-1 text-xs font-medium text-white shadow-lg backdrop-blur">
          {item.name}
        </span>
      </div>
    </Html>
  );
}
