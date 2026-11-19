import {
  DELETE_CONFIRMATION,
  DISPLAY_NAME_MAX,
  deleteHistorySchema,
  displayNameSchema,
  exportFileName,
} from "../schema";

describe("displayNameSchema", () => {
  it("trims and collapses whitespace", () => {
    expect(displayNameSchema.parse("  Ada   Lovelace ")).toBe("Ada Lovelace");
  });

  it("rejects empty names", () => {
    expect(displayNameSchema.safeParse("   ").success).toBe(false);
  });

  it("enforces the database length limit", () => {
    expect(displayNameSchema.safeParse("a".repeat(DISPLAY_NAME_MAX)).success).toBe(true);
    expect(displayNameSchema.safeParse("a".repeat(DISPLAY_NAME_MAX + 1)).success).toBe(false);
  });

  it("rejects control and bidi-override characters", () => {
    expect(displayNameSchema.safeParse("Ada\u0000").success).toBe(false);
    expect(displayNameSchema.safeParse("Ada‮ecalovoL").success).toBe(false);
  });

  it("accepts non-Latin names", () => {
    expect(displayNameSchema.parse("Zoë Ñúñez 李雷")).toBe("Zoë Ñúñez 李雷");
  });
});

describe("deleteHistorySchema", () => {
  it("requires the exact confirmation phrase", () => {
    expect(deleteHistorySchema.safeParse({ confirmation: DELETE_CONFIRMATION }).success).toBe(true);
    expect(deleteHistorySchema.safeParse({ confirmation: "delete" }).success).toBe(false);
    expect(deleteHistorySchema.safeParse({}).success).toBe(false);
  });
});

describe("exportFileName", () => {
  it("uses the UTC date", () => {
    expect(exportFileName(new Date("2026-11-19T23:59:00Z"))).toBe(
      "neurotrack-export-2026-11-19.json",
    );
  });
});
