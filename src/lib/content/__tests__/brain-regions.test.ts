import {
  BRAIN_REGIONS,
  explorerPositions,
  formatReference,
  getBrainRegion,
  regionSummary,
} from "../brain-regions";

const DOI = /^10\.\d{4,9}\//;

describe("brain region content", () => {
  it("covers the six NeuroLab regions", () => {
    expect(BRAIN_REGIONS.map((r) => r.slug).sort()).toEqual(
      [
        "amygdala",
        "basal-ganglia",
        "hippocampus",
        "nucleus-accumbens",
        "prefrontal-cortex",
        "ventral-tegmental-area",
      ].sort(),
    );
  });

  it("has unique slugs", () => {
    const slugs = BRAIN_REGIONS.map((r) => r.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it.each(BRAIN_REGIONS.map((r) => [r.slug, r] as const))(
    "%s has 2-4 references, each with a valid DOI",
    (_slug, region) => {
      expect(region.references.length).toBeGreaterThanOrEqual(2);
      expect(region.references.length).toBeLessThanOrEqual(4);
      for (const ref of region.references) {
        expect(ref.doi).toMatch(DOI);
        if (ref.pmid !== undefined) {
          expect(ref.pmid).toMatch(/^\d+$/);
        }
      }
      const dois = region.references.map((r) => r.doi);
      expect(new Set(dois).size).toBe(dois.length);
    },
  );

  it("fills in every text field", () => {
    for (const region of BRAIN_REGIONS) {
      expect(region.name.length).toBeGreaterThan(0);
      expect(region.anatomy.length).toBeGreaterThan(40);
      expect(region.primaryFunctions.length).toBeGreaterThan(0);
      expect(region.rewardAndLearning.length).toBeGreaterThan(40);
      expect(region.addictionResearch.length).toBeGreaterThan(40);
      expect(region.explorer.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("never claims a region causes addiction", () => {
    for (const region of BRAIN_REGIONS) {
      expect(region.addictionResearch).not.toMatch(/\bcauses?\b/i);
    }
  });

  it("looks regions up by slug", () => {
    expect(getBrainRegion("amygdala")?.abbreviation).toBe("AMY");
    expect(getBrainRegion("nope")).toBeUndefined();
  });

  it("formats a reference", () => {
    const ref = getBrainRegion("ventral-tegmental-area")?.references[0];
    expect(ref && formatReference(ref)).toBe(
      "Schultz W (1998). Predictive reward signal of dopamine neurons. Journal of Neurophysiology 80, 1–27.",
    );
  });
});

describe("explorer helpers", () => {
  it("summarises each region with one complete sentence", () => {
    for (const region of BRAIN_REGIONS) {
      const summary = regionSummary(region);
      expect(summary.length).toBeGreaterThan(20);
      expect(summary).toMatch(/[.!?]$/);
      expect(region.rewardAndLearning.startsWith(summary)).toBe(true);
    }
  });

  it("mirrors bilateral regions and keeps midline regions single", () => {
    for (const region of BRAIN_REGIONS) {
      const positions = explorerPositions(region);
      const [x, y, z] = region.explorer.position;
      if (x === 0) {
        expect(positions).toEqual([[0, y, z]]);
      } else {
        expect(positions).toEqual([
          [x, y, z],
          [-x, y, z],
        ]);
      }
    }
  });

  it("places every region inside the stylised brain", () => {
    for (const region of BRAIN_REGIONS) {
      const [x, y, z] = region.explorer.position;
      expect(Math.abs(x)).toBeLessThanOrEqual(1.4);
      expect(Math.abs(y)).toBeLessThanOrEqual(1);
      expect(Math.abs(z)).toBeLessThanOrEqual(1.6);
    }
  });
});
