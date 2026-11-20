import {
  EXPLORER_ITEMS,
  MODEL_NODES,
  getExplorerItem,
  itemsForMode,
  nodeItemMap,
  nodeRole,
  nodeRoles,
} from "../catalog";
import { VIEW_PRESETS } from "../views";

describe("explorer catalog", () => {
  it("lists the anatomy structures in Structures mode", () => {
    expect(itemsForMode("structures").map((i) => i.slug)).toEqual([
      "frontal-lobe",
      "parietal-lobe",
      "temporal-lobe",
      "occipital-lobe",
      "insula",
      "limbic-lobe",
      "cerebellum",
      "brainstem",
      "corpus-callosum",
    ]);
  });

  it("lists the six reward regions first, then thalamus and hypothalamus, in deep mode", () => {
    const deep = itemsForMode("deep");
    expect(deep.slice(0, 6).every((i) => i.kind === "region" && i.hasPage)).toBe(true);
    expect(deep.slice(6).map((i) => i.slug)).toEqual(["thalamus", "hypothalamus"]);
  });

  it("resolves every item to model nodes and a known view", () => {
    for (const item of EXPLORER_ITEMS) {
      expect(item.nodes.length).toBeGreaterThan(0);
      for (const node of item.nodes) expect(MODEL_NODES[node]).toBeDefined();
      expect(VIEW_PRESETS[item.view]).toBeDefined();
    }
  });

  it("maps bilateral parts to both hemispheres and midline parts once", () => {
    expect(getExplorerItem("structures", "frontal-lobe")?.nodes).toEqual([
      "lh_motor_frontal",
      "lh_prefrontal",
      "rh_motor_frontal",
      "rh_prefrontal",
    ]);
    expect(getExplorerItem("structures", "cerebellum")?.nodes).toEqual(["mid_cerebellum"]);
  });

  it("finds items only in their own mode", () => {
    expect(getExplorerItem("structures", "nucleus-accumbens")).toBeUndefined();
    expect(getExplorerItem("deep", "nucleus-accumbens")?.name).toBe("Nucleus accumbens");
  });

  it("marks the VTA as approximate", () => {
    expect(getExplorerItem("deep", "ventral-tegmental-area")?.approximate).toBeTruthy();
  });

  it("maps each node to at most one item per mode", () => {
    for (const mode of ["structures", "deep"] as const) {
      const nodes = itemsForMode(mode).flatMap((i) => i.nodes);
      expect(new Set(nodes).size).toBe(nodes.length);
      expect(nodeItemMap(mode).size).toBe(nodes.length);
    }
  });

  describe("node roles", () => {
    it("Structures mode: items solid and clickable, other surface parts context, deep hidden", () => {
      expect(nodeRole("structures", "lh_temporal")).toBe("pickable");
      expect(nodeRole("structures", "lh_olfactory")).toBe("context");
      expect(nodeRole("structures", "lh_nucleus_accumbens")).toBe("hidden");
    });

    it("deep mode: deep items clickable, cortex ghosted, prefrontal a tinted ghost", () => {
      expect(nodeRole("deep", "lh_nucleus_accumbens")).toBe("pickable");
      expect(nodeRole("deep", "mid_midbrain_tegmentum")).toBe("pickable");
      expect(nodeRole("deep", "lh_prefrontal")).toBe("ghost-item");
      expect(nodeRole("deep", "lh_temporal")).toBe("ghost");
      expect(nodeRole("deep", "lh_globus_pallidus")).toBe("context");
    });

    it("gives every model node a role in both modes", () => {
      for (const mode of ["structures", "deep"] as const) {
        expect(nodeRoles(mode).size).toBe(Object.keys(MODEL_NODES).length);
      }
      expect(nodeRole("structures", "not_a_node")).toBe("hidden");
    });
  });
});
