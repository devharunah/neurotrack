import {
  DEFAULT_QUESTIONNAIRE,
  DEFAULT_SCHEDULE,
  type Questionnaire,
  createStudySchema,
  joinCodeSchema,
  observationSchema,
  parseQuestionnaire,
  questionnaireSchema,
  scheduleSchema,
  seedSchema,
  studySettingsSchema,
} from "../schemas";

const NOW = new Date("2026-11-20T12:00:00Z");

const SETTINGS = {
  title: "Evening cravings",
  description: "",
  status: "active" as const,
  synthetic: true,
  ethics_approval_ref: "",
  questionnaire: DEFAULT_QUESTIONNAIRE,
  schedule: DEFAULT_SCHEDULE,
};

const OBSERVATION = {
  observed_at: "2026-11-20T11:30:00.000Z",
  mood: 6,
  stress: 4,
  sleep_quality: 7,
  craving_intensity: 3,
  environment: "home",
  social_context: "alone",
};

describe("study schemas", () => {
  it("trims titles and requires one", () => {
    expect(createStudySchema.parse({ title: "  Pilot  " })).toEqual({
      title: "Pilot",
      description: "",
    });
    expect(createStudySchema.safeParse({ title: "   " }).success).toBe(false);
    expect(createStudySchema.safeParse({ title: "x".repeat(121) }).success).toBe(false);
  });

  it("requires an ethics reference for real data, mirroring the database CHECK", () => {
    expect(studySettingsSchema.safeParse(SETTINGS).success).toBe(true);
    const real = studySettingsSchema.safeParse({ ...SETTINGS, synthetic: false });
    expect(real.success).toBe(false);
    expect(real.error?.issues[0]?.path).toEqual(["ethics_approval_ref"]);
    expect(
      studySettingsSchema.safeParse({ ...SETTINGS, synthetic: false, ethics_approval_ref: "   " })
        .success,
    ).toBe(false);
    expect(
      studySettingsSchema.safeParse({
        ...SETTINGS,
        synthetic: false,
        ethics_approval_ref: "REC-2026-123",
      }).success,
    ).toBe(true);
  });

  it("caps custom questions at five with unique ids", () => {
    const question = (i: number) => ({
      id: `q_abcd${i}`,
      prompt: "Hours outside?",
      type: "scale" as const,
    });
    const five = { ...DEFAULT_QUESTIONNAIRE, custom: [1, 2, 3, 4, 5].map(question) };
    expect(questionnaireSchema.safeParse(five).success).toBe(true);
    const six = { ...five, custom: [...five.custom, question(6)] };
    expect(questionnaireSchema.safeParse(six).success).toBe(false);
    const dupes = { ...DEFAULT_QUESTIONNAIRE, custom: [question(1), question(1)] };
    expect(questionnaireSchema.safeParse(dupes).success).toBe(false);
    expect(
      questionnaireSchema.safeParse({
        ...DEFAULT_QUESTIONNAIRE,
        custom: [{ id: "bad id", prompt: "Hi there", type: "scale" }],
      }).success,
    ).toBe(false);
  });

  it("requires at least one question", () => {
    const none = {
      ...DEFAULT_QUESTIONNAIRE,
      fields: Object.fromEntries(Object.keys(DEFAULT_QUESTIONNAIRE.fields).map((k) => [k, false])),
    };
    expect(questionnaireSchema.safeParse(none).success).toBe(false);
  });

  it("falls back to the default questionnaire for malformed stored json", () => {
    expect(parseQuestionnaire({ nope: true })).toEqual(DEFAULT_QUESTIONNAIRE);
  });

  it("bounds the schedule like the database does", () => {
    expect(scheduleSchema.safeParse(DEFAULT_SCHEDULE).success).toBe(true);
    expect(scheduleSchema.safeParse({ ...DEFAULT_SCHEDULE, prompts_per_day: 7 }).success).toBe(
      false,
    );
    expect(scheduleSchema.safeParse({ ...DEFAULT_SCHEDULE, duration_days: 0 }).success).toBe(false);
    expect(
      scheduleSchema.safeParse({ ...DEFAULT_SCHEDULE, timezone: "Mars/Olympus" }).success,
    ).toBe(false);
  });

  it("normalises join codes and rejects ambiguous characters", () => {
    expect(joinCodeSchema.parse(" k7m2q9tx ")).toBe("K7M2Q9TX");
    expect(joinCodeSchema.safeParse("K7M2Q9T0").success).toBe(false);
    expect(joinCodeSchema.safeParse("K7M2Q9T").success).toBe(false);
  });

  it("bounds the seeder", () => {
    expect(seedSchema.safeParse({ participants: 20, days: 30, seed: 1 }).success).toBe(true);
    expect(seedSchema.safeParse({ participants: 61, days: 30, seed: 1 }).success).toBe(false);
  });
});

describe("observationSchema", () => {
  const schema = observationSchema(DEFAULT_QUESTIONNAIRE, NOW);

  it("accepts a complete observation", () => {
    expect(schema.safeParse(OBSERVATION).success).toBe(true);
  });

  it("rejects out-of-range and fractional scores", () => {
    expect(schema.safeParse({ ...OBSERVATION, stress: 11 }).success).toBe(false);
    expect(schema.safeParse({ ...OBSERVATION, mood: -1 }).success).toBe(false);
    expect(schema.safeParse({ ...OBSERVATION, craving_intensity: 2.5 }).success).toBe(false);
    expect(schema.safeParse({ ...OBSERVATION, environment: "bar" }).success).toBe(false);
  });

  it("requires enabled fields and refuses disabled ones", () => {
    const withoutMood = Object.fromEntries(
      Object.entries(OBSERVATION).filter(([key]) => key !== "mood"),
    );
    expect(schema.safeParse(withoutMood).success).toBe(false);
    // substance_use is off by default, so a value is refused.
    expect(schema.safeParse({ ...OBSERVATION, substance_use: true }).success).toBe(false);
  });

  it("treats substance use as voluntary when enabled", () => {
    const q: Questionnaire = {
      ...DEFAULT_QUESTIONNAIRE,
      fields: { ...DEFAULT_QUESTIONNAIRE.fields, substance_use: true },
    };
    const s = observationSchema(q, NOW);
    expect(s.safeParse({ ...OBSERVATION, substance_use: null }).success).toBe(true);
    expect(s.safeParse({ ...OBSERVATION, substance_use: false }).success).toBe(true);
  });

  it("only accepts answers to the study's custom questions", () => {
    const q: Questionnaire = {
      ...DEFAULT_QUESTIONNAIRE,
      custom: [
        { id: "q_scale1", prompt: "Hours outside?", type: "scale" },
        { id: "q_text01", prompt: "Anything else?", type: "text" },
      ],
    };
    const s = observationSchema(q, NOW);
    expect(
      s.safeParse({ ...OBSERVATION, answers: { q_scale1: 4, q_text01: "fine" } }).success,
    ).toBe(true);
    expect(s.safeParse({ ...OBSERVATION, answers: { q_scale1: 12 } }).success).toBe(false);
    expect(s.safeParse({ ...OBSERVATION, answers: { q_other: 1 } }).success).toBe(false);
    expect(s.safeParse({ ...OBSERVATION, answers: { q_text01: "x".repeat(281) } }).success).toBe(
      false,
    );
  });

  it("keeps observation times inside the window the database allows", () => {
    for (const observed_at of ["2026-11-21T12:00:00Z", "2026-11-01T12:00:00Z", "yesterday"]) {
      expect(schema.safeParse({ ...OBSERVATION, observed_at }).success).toBe(false);
    }
  });
});
