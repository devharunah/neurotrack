import { computeDashboard } from "../analytics";
import { BOM, buildStudyExport } from "../export";
import type { ObservationRecord, ParticipantRecord } from "../records";
import { DEFAULT_QUESTIONNAIRE, DEFAULT_SCHEDULE } from "../schemas";

const NOW = new Date("2026-11-10T18:00:00Z");

const participants: ParticipantRecord[] = [
  { id: "a", pseudonym: "P-AAAA", synthetic: true, created_at: "2026-11-01T06:00:00Z" },
  { id: "b", pseudonym: "P-BBBB", synthetic: true, created_at: "2026-11-08T06:00:00Z" },
];

const obs = (
  id: string,
  participant: string,
  at: string,
  extra: Partial<ObservationRecord> = {},
): ObservationRecord => ({
  id,
  participant_id: participant,
  observed_at: at,
  mood: 5,
  stress: 4,
  sleep_quality: 6,
  craving_intensity: 3,
  environment: "home",
  social_context: "alone",
  substance_use: null,
  answers: {},
  ...extra,
});

describe("computeDashboard", () => {
  const data = computeDashboard({
    participants,
    consents: [
      {
        participant_id: "b",
        consent_version: "1.0",
        given_at: "2026-11-08T06:00:00Z",
        withdrawn_at: "2026-11-09T18:00:00Z",
      },
    ],
    observations: [
      obs("1", "a", "2026-11-01T07:00:00Z", { craving_intensity: 7 }),
      obs("2", "a", "2026-11-03T16:00:00Z", { environment: null }),
      obs("3", "b", "2026-11-09T16:30:00Z", { mood: 9, stress: 2 }),
    ],
    schedule: DEFAULT_SCHEDULE,
    now: NOW,
  });

  it("counts totals and consent", () => {
    expect(data.totals).toMatchObject({
      participants: 2,
      activeConsents: 1,
      withdrawn: 1,
      observations: 3,
      firstDay: "2026-11-01",
      lastDay: "2026-11-09",
    });
  });

  it("fills every local day, zero when nothing was observed", () => {
    expect(data.days).toHaveLength(9);
    expect(data.days[1]).toMatchObject({ date: "2026-11-02", count: 0, mood: null });
    expect(data.days.at(-1)).toMatchObject({ count: 1, mood: 9, stress: 2 });
  });

  it("builds the distributions and breakdowns", () => {
    expect(data.craving[7]?.count).toBe(1);
    expect(data.craving[3]?.count).toBe(2);
    expect(data.environment.find((e) => e.key === "unanswered")?.count).toBe(1);
    expect(data.environment.find((e) => e.key === "home")?.count).toBe(2);
    // Kampala is UTC+3, so 16:00Z is 19:00 local; fewer than 5 values are suppressed.
    expect(data.hours[19]).toMatchObject({ n: 2, mean: null });
  });

  it("measures missing prompts against the schedule, stopping at withdrawal", () => {
    const a = data.adherence.find((p) => p.pseudonym === "P-AAAA");
    const b = data.adherence.find((p) => p.pseudonym === "P-BBBB");
    // a: 1-10 Nov local (10 days, 1 prompt a day), 2 observed.
    expect(a).toMatchObject({ expected: 10, observed: 2, missing: 8, consent: "active" });
    // b: 8-9 Nov local, withdrawn on the 9th.
    expect(b).toMatchObject({ expected: 2, observed: 1, missing: 1, consent: "withdrawn" });
    expect(data.totals.completion).toBeCloseTo(3 / 12, 3);
    expect(data.adherence[0]?.pseudonym).toBe("P-AAAA");
  });
});

describe("buildStudyExport", () => {
  it("writes pseudonyms only, escapes text answers and names the file", () => {
    const result = buildStudyExport({
      title: "Evening Study",
      synthetic: true,
      questionnaire: {
        ...DEFAULT_QUESTIONNAIRE,
        custom: [{ id: "q_note01", prompt: "Anything else?", type: "text" }],
      },
      timeZone: "Africa/Kampala",
      participants,
      observations: [
        obs("1", "a", "2026-11-01T07:00:00Z", { answers: { q_note01: "=cmd()" } }),
        obs("x", "unknown", "2026-11-01T07:00:00Z"),
      ],
      now: NOW,
    });
    expect(result.rowCount).toBe(1);
    expect(result.filename).toBe("evening-study-synthetic-2026-11-10.csv");
    expect(result.csv.startsWith(BOM)).toBe(true);
    const lines = result.csv.slice(1).split("\r\n");
    expect(lines[0]).toBe(
      "pseudonym,synthetic,observed_at_utc,observed_at_local,mood,stress,sleep_quality,craving_intensity,environment,social_context,substance_use,custom_q_note01",
    );
    expect(lines[1]).toBe(
      "P-AAAA,true,2026-11-01T07:00:00.000Z,2026-11-01T10:00:00+03:00,5,4,6,3,home,alone,,'=cmd()",
    );
    expect(result.csv).not.toContain("participant_id");
  });
});
