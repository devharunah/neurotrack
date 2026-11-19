import {
  citationMarkers,
  citedSourceIndices,
  groupBySection,
  parseMarkedText,
  sourceAnchorId,
} from "../citations";
import type { CitedSentence } from "../types";

describe("citationMarkers", () => {
  it("links each cited index to its source anchor", () => {
    expect(citationMarkers([2, 1], 3)).toEqual([
      { index: 2, label: "[2]", href: "#source-2" },
      { index: 1, label: "[1]", href: "#source-1" },
    ]);
    expect(sourceAnchorId(4)).toBe("source-4");
  });

  it("drops duplicates and indices that point at no listed source", () => {
    expect(citationMarkers([1, 1, 0, -2, 4, 2.5, 3], 3).map((m) => m.index)).toEqual([1, 3]);
    expect(citationMarkers([1], 0)).toEqual([]);
  });
});

describe("parseMarkedText", () => {
  it("splits inline markers, including grouped ones", () => {
    expect(parseMarkedText("A finding [1][2] and another [1, 3].", 3)).toEqual([
      { kind: "text", text: "A finding " },
      { kind: "citation", index: 1 },
      { kind: "citation", index: 2 },
      { kind: "text", text: " and another " },
      { kind: "citation", index: 1 },
      { kind: "citation", index: 3 },
      { kind: "text", text: "." },
    ]);
  });

  it("leaves out-of-range markers as plain text instead of dead links", () => {
    expect(parseMarkedText("Made up [9] but real [1]", 2)).toEqual([
      { kind: "text", text: "Made up [9] but real " },
      { kind: "citation", index: 1 },
    ]);
    expect(parseMarkedText("No markers at all.", 2)).toEqual([
      { kind: "text", text: "No markers at all." },
    ]);
    expect(parseMarkedText("[0]", 2)).toEqual([{ kind: "text", text: "[0]" }]);
  });
});

describe("groupBySection", () => {
  const s = (text: string, section: CitedSentence["section"], citations = [1]): CitedSentence => ({
    text,
    citations,
    section,
  });

  it("groups consecutive sentences and titles each section", () => {
    const groups = groupBySection([
      s("a", "established"),
      s("b", "established"),
      s("c", "emerging", [2]),
      s("d", "open-questions", [1, 2]),
    ]);
    expect(groups.map((g) => [g.title, g.sentences.length])).toEqual([
      ["Established findings", 2],
      ["Emerging evidence", 1],
      ["Open questions", 1],
    ]);
  });

  it("returns one untitled group for extractive answers", () => {
    const groups = groupBySection([s("a", null), s("b", null)]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.title).toBeNull();
    expect(groupBySection([])).toEqual([]);
  });

  it("collects the cited source indices", () => {
    expect([...citedSourceIndices([s("a", null, [1, 3]), s("b", null, [3])])]).toEqual([1, 3]);
  });
});
