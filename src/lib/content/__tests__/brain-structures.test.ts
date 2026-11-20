import brainModel from "../brain-model.json";
import { BRAIN_REGIONS } from "../brain-regions";
import { BRAIN_STRUCTURES, brainStructureSchema, getBrainStructure } from "../brain-structures";

const modelParts = new Set(Object.values(brainModel.nodes).map((node) => node.part));
const regionSlugs = BRAIN_REGIONS.map((region) => region.slug);
const structureSlugs = BRAIN_STRUCTURES.map((structure) => structure.slug);

describe("brain structure content", () => {
  it.each(BRAIN_STRUCTURES.map((s) => [s.slug, s] as const))("%s matches the schema", (_, s) => {
    expect(() => brainStructureSchema.parse(s)).not.toThrow();
  });

  it("covers the lobes and major structures of the explorer", () => {
    expect([...structureSlugs].sort()).toEqual(
      [
        "brainstem",
        "cerebellum",
        "corpus-callosum",
        "frontal-lobe",
        "hypothalamus",
        "insula",
        "limbic-lobe",
        "occipital-lobe",
        "parietal-lobe",
        "temporal-lobe",
        "thalamus",
      ].sort(),
    );
  });

  it("uses slugs that are unique and do not collide with the reward-circuit regions", () => {
    const all = [...structureSlugs, ...regionSlugs];
    expect(new Set(all).size).toBe(all.length);
  });

  it("binds every structure to parts that exist in the 3D model", () => {
    for (const structure of BRAIN_STRUCTURES) {
      for (const part of structure.explorer.parts) {
        expect(modelParts).toContain(part);
      }
    }
  });

  it("does not bind one part to two structures shown in the same mode", () => {
    for (const mode of ["structures", "deep"] as const) {
      const parts = BRAIN_STRUCTURES.filter((s) => s.explorer.mode === mode).flatMap(
        (s) => s.explorer.parts,
      );
      expect(new Set(parts).size).toBe(parts.length);
    }
  });

  it("links related items only to structures or regions that exist", () => {
    const known = new Set([...structureSlugs, ...regionSlugs]);
    for (const structure of BRAIN_STRUCTURES) {
      for (const slug of structure.related) {
        expect(known).toContain(slug);
        expect(slug).not.toBe(structure.slug);
      }
    }
  });

  it("gives every reference both a DOI and a PMID", () => {
    for (const structure of BRAIN_STRUCTURES) {
      for (const ref of structure.references) {
        expect(ref.pmid).toMatch(/^\d+$/);
      }
    }
  });

  it("looks structures up by slug", () => {
    expect(getBrainStructure("cerebellum")?.name).toBe("Cerebellum");
    expect(getBrainStructure("nope")).toBeUndefined();
  });
});
