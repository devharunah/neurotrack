import {
  MAX_QUERY_LENGTH,
  answerInputSchema,
  normaliseQuery,
  noteSchema,
  parseMode,
  searchInputSchema,
} from "../query";

describe("normaliseQuery", () => {
  it("collapses whitespace and control characters and trims", () => {
    expect(normaliseQuery("  dopamine \n\t reward   prediction  ")).toBe(
      "dopamine reward prediction",
    );
    expect(normaliseQuery("a\u0000b")).toBe("a b");
    expect(normaliseQuery("   ")).toBe("");
  });
});

describe("searchInputSchema", () => {
  it("normalises the query and applies defaults", () => {
    expect(searchInputSchema.parse({ q: "  reward  learning " })).toEqual({
      q: "reward learning",
      source: "all",
      limit: 10,
    });
    expect(searchInputSchema.parse({ q: "ab", source: "pubmed", limit: "25" })).toEqual({
      q: "ab",
      source: "pubmed",
      limit: 25,
    });
  });

  it("rejects blank, too long, unknown source and out-of-range limits", () => {
    expect(searchInputSchema.safeParse({ q: "   a  " }).success).toBe(false);
    expect(searchInputSchema.safeParse({ q: "x".repeat(MAX_QUERY_LENGTH + 1) }).success).toBe(
      false,
    );
    expect(searchInputSchema.safeParse({ q: "dopamine", source: "scholar" }).success).toBe(false);
    expect(searchInputSchema.safeParse({ q: "dopamine", limit: 26 }).success).toBe(false);
    expect(searchInputSchema.safeParse({ q: "dopamine", limit: 0 }).success).toBe(false);
  });

  it("counts length after normalisation", () => {
    const padded = `  ${"x".repeat(MAX_QUERY_LENGTH)}   `;
    expect(searchInputSchema.safeParse({ q: padded }).success).toBe(true);
  });
});

describe("answerInputSchema", () => {
  it("limits sources to 1..8", () => {
    expect(answerInputSchema.parse({ question: "Why?? dopamine" }).maxSources).toBe(5);
    expect(answerInputSchema.safeParse({ question: "dopamine", maxSources: 9 }).success).toBe(
      false,
    );
    const blank = answerInputSchema.safeParse({ question: " " });
    expect(blank.success).toBe(false);
    expect(blank.error?.issues[0]?.message).toBe("The question must be at least 2 characters.");
  });
});

describe("noteSchema and parseMode", () => {
  it("trims notes and enforces the length cap", () => {
    expect(noteSchema.parse("  read later \r\n")).toBe("read later");
    expect(noteSchema.safeParse("x".repeat(2001)).success).toBe(false);
  });

  it("falls back to search for unknown modes", () => {
    expect(parseMode("answer")).toBe("answer");
    expect(parseMode("library")).toBe("library");
    expect(parseMode("nope")).toBe("search");
    expect(parseMode(undefined)).toBe("search");
  });
});
