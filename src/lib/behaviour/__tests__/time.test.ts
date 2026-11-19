import {
  addDays,
  daysBetween,
  isValidTimeZone,
  localDateKey,
  localHour,
  offsetMinutes,
  toZonedIso,
  zonedTimeToUtc,
} from "../time";

describe("time helpers", () => {
  const at = new Date("2026-11-20T22:30:00Z");

  it("reads wall time in the study zone", () => {
    expect(localHour(at, "Africa/Kampala")).toBe(1);
    expect(localDateKey(at, "Africa/Kampala")).toBe("2026-11-21");
    expect(localDateKey(at, "UTC")).toBe("2026-11-20");
    expect(offsetMinutes(at, "Africa/Kampala")).toBe(180);
    expect(offsetMinutes(at, "America/New_York")).toBe(-300);
  });

  it("formats ISO with the offset", () => {
    expect(toZonedIso(at, "Africa/Kampala")).toBe("2026-11-21T01:30:00+03:00");
    expect(toZonedIso(at, "America/New_York")).toBe("2026-11-20T17:30:00-05:00");
  });

  it("converts local wall time back to an instant, across DST", () => {
    expect(
      zonedTimeToUtc({ year: 2026, month: 11, day: 21, hour: 1, minute: 30 }, "Africa/Kampala"),
    ).toEqual(at);
    expect(
      zonedTimeToUtc({ year: 2026, month: 7, day: 1, hour: 9, minute: 0 }, "Europe/London"),
    ).toEqual(new Date("2026-07-01T08:00:00Z"));
  });

  it("does calendar arithmetic on day keys", () => {
    expect(addDays("2026-02-27", 2)).toBe("2026-03-01");
    expect(daysBetween("2026-11-01", "2026-11-30")).toBe(29);
  });

  it("validates zones", () => {
    expect(isValidTimeZone("Africa/Kampala")).toBe(true);
    expect(isValidTimeZone("Nowhere/Land")).toBe(false);
  });
});
