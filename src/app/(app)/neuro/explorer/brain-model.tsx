"use client";

import { useGLTF } from "@react-three/drei";
import { type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { Color, type Mesh } from "three";

import {
  type ExplorerItem,
  type ExplorerMode,
  MODEL_NODES,
  type NodeRole,
  getExplorerItem,
  nodeItemMap,
  nodeRoles,
} from "@/lib/brain/catalog";
import type { ExplorerState } from "@/lib/brain/explorer-store";
import brainModel from "@/lib/content/brain-model.json";

import { useExplorerStore } from "./explorer-context";
import {
  type StructureMaterial,
  TISSUE_COLOR,
  createStructureMaterial,
} from "./structure-material";

export const MODEL_URL = brainModel.model.file;

const MODES: readonly ExplorerMode[] = ["structures", "deep"];
const ROLES = Object.fromEntries(MODES.map((m) => [m, nodeRoles(m)])) as Record<
  ExplorerMode,
  ReadonlyMap<string, NodeRole>
>;
const ITEMS = Object.fromEntries(MODES.map((m) => [m, nodeItemMap(m)])) as Record<
  ExplorerMode,
  ReadonlyMap<string, ExplorerItem>
>;

const TISSUE = new Color(TISSUE_COLOR);
const ITEM_COLORS = new Map<string, Color>();
function itemColor(item: ExplorerItem): Color {
  let color = ITEM_COLORS.get(item.color);
  if (!color) {
    color = new Color(item.color);
    ITEM_COLORS.set(item.color, color);
  }
  return color;
}

/** Pixels the pointer may travel between press and release and still count as a click. */
const CLICK_TOLERANCE_PX = 5;
/** Damping rate for highlight/dim/ghost transitions (per second). */
const DAMPING = 7;

interface NodeEntry {
  name: string;
  mesh: Mesh;
  side: string;
  structure: StructureMaterial;
}

/**
 * First pickable structure under the pointer. Solid non-pickable parts block what is behind
 * them; ghosts and hidden parts do not.
 */
function pickSlug(event: ThreeEvent<MouseEvent>, mode: ExplorerMode): string | null {
  for (const hit of event.intersections) {
    if (!hit.object.visible) continue;
    const role = ROLES[mode].get(hit.object.name);
    if (role === "pickable") return ITEMS[mode].get(hit.object.name)?.slug ?? null;
    if (role === "context") return null;
  }
  return null;
}

/** Moves `uniform` a fraction `rate` towards `target`; returns true while still moving. */
function approach(uniform: { value: number }, target: number, rate: number): boolean {
  const next = uniform.value + (target - uniform.value) * rate;
  const moving = Math.abs(target - next) > 0.002;
  uniform.value = moving ? next : target;
  return moving;
}

/** Same as `approach`, for a colour. */
function approachColor(color: Color, target: Color, rate: number): boolean {
  const gap =
    Math.abs(color.r - target.r) + Math.abs(color.g - target.g) + Math.abs(color.b - target.b);
  if (gap > 0.004) {
    color.lerp(target, rate);
    return true;
  }
  color.copy(target);
  return false;
}

/**
 * Per-frame update of every node: visibility, ghosting and damped highlight/dim/hover.
 * Kept outside the component because it mutates three.js objects, not React state.
 * Returns true while any transition is still running (so demand-mode rendering continues).
 */
function animateNodes(
  nodes: readonly NodeEntry[],
  { mode, selected, hovered, hiddenSide, atlasColors }: ExplorerState,
  rate: number,
): boolean {
  let settling = false;
  const selectedItem = selected ? getExplorerItem(mode, selected) : undefined;
  for (const node of nodes) {
    const role = ROLES[mode].get(node.name) ?? "hidden";
    const item = ITEMS[mode].get(node.name);
    const { material, uniforms } = node.structure;
    const isSelected = item !== undefined && item.slug === selected;
    const isHovered = item !== undefined && item.slug === hovered;
    const dim = selected !== null && !isSelected && (role === "pickable" || role === "context");
    // In deep mode (and for buried structures such as the insula), the other structures turn
    // translucent around a selection so the selected one is never hidden behind them.
    const seeThrough = dim && (mode === "deep" || selectedItem?.reveal === true);
    const ghost = role === "ghost" || role === "ghost-item" || seeThrough;
    node.mesh.visible = role !== "hidden" && node.side !== hiddenSide;
    node.mesh.renderOrder = ghost ? 1 : 0;
    material.depthWrite = !ghost;

    // Deep-mode structures carry their colour all the time; in Structures mode the brain is
    // tissue-coloured and an item takes its colour only when selected.
    const coloured = role === "pickable" && (mode === "deep" || atlasColors);
    const base = coloured && item ? itemColor(item) : TISSUE;
    // Ghosts of inner, non-cortical parts (brainstem around the VTA) stay faint so the
    // structures inside them keep their colour.
    const info = MODEL_NODES[node.name];
    uniforms.uGhostStrength.value = info?.group === "cortex" ? 1 : 0.25;
    // A surface part shown solid among the deep structures (the midbrain tegmentum, for the
    // VTA) had its AO baked as a buried surface; soften it so it keeps its colour.
    uniforms.uAo.value = mode === "deep" && role === "pickable" && info?.surface ? 0.2 : 0.72;
    uniforms.uItemColor.value.copy(item ? itemColor(item) : TISSUE);

    const ghostTint = role === "ghost-item" ? (isSelected ? 1 : 0.55) : seeThrough ? 1 : 0;
    // Bitwise OR, not ||: every uniform must step this frame, without allocating.
    const moving =
      Number(approachColor(material.color, base, rate)) |
      Number(approach(uniforms.uHighlight, isSelected ? 1 : 0, rate)) |
      Number(approach(uniforms.uHover, isHovered ? 1 : 0, rate)) |
      Number(approach(uniforms.uDim, dim ? 1 : 0, rate)) |
      Number(approach(uniforms.uGhost, ghost ? (seeThrough ? 0.8 : 1) : 0, rate)) |
      Number(approach(uniforms.uGhostTint, ghostTint, rate));
    if (moving) settling = true;
  }
  return settling;
}

function setCursor(pointer: boolean): void {
  document.body.style.cursor = pointer ? "pointer" : "";
}

export function BrainModel({ reducedMotion }: { reducedMotion: boolean }) {
  const { scene } = useGLTF(MODEL_URL, false, true);
  const store = useExplorerStore();
  const invalidate = useThree((state) => state.invalidate);

  const nodes = useMemo(() => {
    const entries: NodeEntry[] = [];
    scene.traverse((object) => {
      const mesh = object as Mesh;
      const info = MODEL_NODES[mesh.name];
      if (!mesh.isMesh || !info) return;
      const structure = createStructureMaterial();
      mesh.material = structure.material;
      entries.push({ name: mesh.name, mesh, side: info.side, structure });
    });
    return entries;
  }, [scene]);

  useEffect(
    () => () => {
      for (const node of nodes) node.structure.material.dispose();
      setCursor(false);
    },
    [nodes],
  );

  useEffect(() => {
    store.setModelReady(true);
    // With an on-demand frame loop, any state change (hover, selection, mode) must ask for a
    // frame; the transitions then keep requesting frames until they settle.
    const unsubscribe = store.subscribe(() => invalidate());
    return () => {
      unsubscribe();
      store.setModelReady(false);
    };
  }, [store, invalidate]);

  useFrame((_, delta) => {
    const rate = reducedMotion ? 1 : 1 - Math.exp(-delta * DAMPING);
    if (animateNodes(nodes, store.getState(), rate)) invalidate();
  });

  const onPointerMove = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    const slug = pickSlug(event, store.getState().mode);
    store.hover(slug);
    setCursor(slug !== null);
  };
  const onPointerOut = () => {
    store.hover(null);
    setCursor(false);
  };
  const onClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (event.delta > CLICK_TOLERANCE_PX) return;
    store.select(pickSlug(event, store.getState().mode));
  };

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: a three.js object, not a DOM node; the structure list beside the canvas is the keyboard equivalent.
    <primitive
      object={scene}
      onPointerMove={onPointerMove}
      onPointerOut={onPointerOut}
      onClick={onClick}
    />
  );
}

useGLTF.preload(MODEL_URL, false, true);
