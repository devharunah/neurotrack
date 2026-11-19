/**
 * BehaviourLab data contracts. They mirror the CHECK constraints in
 * supabase/migrations/20261120000000_behaviourlab.sql, so bad input is rejected with a readable
 * message before it reaches the database (which rejects it again).
 */
import { z } from "zod";

import { DEFAULT_TIME_ZONE, isValidTimeZone } from "./time";

export const SCORE_FIELDS = ["mood", "stress", "sleep_quality", "craving_intensity"] as const;
export type ScoreField = (typeof SCORE_FIELDS)[number];

export const STANDARD_FIELDS = [
  ...SCORE_FIELDS,
  "environment",
  "social_context",
  "substance_use",
] as const;
export type StandardField = (typeof STANDARD_FIELDS)[number];

export const ENVIRONMENTS = [
  "home",
  "work_or_school",
  "social_venue",
  "outdoors",
  "transit",
  "other",
] as const;
export type Environment = (typeof ENVIRONMENTS)[number];

export const SOCIAL_CONTEXTS = [
  "alone",
  "family",
  "friends",
  "colleagues",
  "strangers",
  "other",
] as const;
export type SocialContext = (typeof SOCIAL_CONTEXTS)[number];

export const STUDY_STATUSES = ["draft", "active", "closed"] as const;
export type StudyStatus = (typeof STUDY_STATUSES)[number];

export const FIELD_LABELS: Record<StandardField, { label: string; prompt: string }> = {
  mood: { label: "Mood", prompt: "How is your mood right now? (0 = very low, 10 = very good)" },
  stress: { label: "Stress", prompt: "How stressed do you feel? (0 = not at all, 10 = extremely)" },
  sleep_quality: {
    label: "Sleep quality",
    prompt: "How well did you sleep last night? (0 = very badly, 10 = very well)",
  },
  craving_intensity: {
    label: "Craving intensity",
    prompt: "How strong is any craving right now? (0 = none, 10 = overwhelming)",
  },
  environment: { label: "Environment", prompt: "Where are you?" },
  social_context: { label: "Social context", prompt: "Who are you with?" },
  substance_use: {
    label: "Substance use (voluntary)",
    prompt: "Have you used a substance since your last check-in? You may leave this unanswered.",
  },
};

export const ENVIRONMENT_LABELS: Record<Environment, string> = {
  home: "Home",
  work_or_school: "Work or school",
  social_venue: "Social venue",
  outdoors: "Outdoors",
  transit: "In transit",
  other: "Somewhere else",
};

export const SOCIAL_CONTEXT_LABELS: Record<SocialContext, string> = {
  alone: "Alone",
  family: "Family",
  friends: "Friends",
  colleagues: "Colleagues",
  strangers: "Strangers",
  other: "Someone else",
};

export const MAX_CUSTOM_QUESTIONS = 5;
export const MAX_TEXT_ANSWER = 280;

const trimmed = (max: number) => z.string().trim().max(max);

export const customQuestionSchema = z.object({
  id: z.string().regex(/^q_[a-z0-9]{4,12}$/, "Invalid question id."),
  prompt: trimmed(200).min(3, "Each custom question needs a prompt of at least 3 characters."),
  type: z.enum(["scale", "text"]),
});
export type CustomQuestion = z.infer<typeof customQuestionSchema>;

export const questionnaireSchema = z
  .object({
    version: z.literal(1),
    fields: z.object({
      mood: z.boolean(),
      stress: z.boolean(),
      sleep_quality: z.boolean(),
      craving_intensity: z.boolean(),
      environment: z.boolean(),
      social_context: z.boolean(),
      substance_use: z.boolean(),
    }),
    custom: z
      .array(customQuestionSchema)
      .max(MAX_CUSTOM_QUESTIONS, `At most ${MAX_CUSTOM_QUESTIONS} custom questions.`),
  })
  .refine((q) => new Set(q.custom.map((c) => c.id)).size === q.custom.length, {
    message: "Custom question ids must be unique.",
    path: ["custom"],
  })
  .refine((q) => Object.values(q.fields).some(Boolean) || q.custom.length > 0, {
    message: "Ask at least one question.",
    path: ["fields"],
  });
export type Questionnaire = z.infer<typeof questionnaireSchema>;

export const DEFAULT_QUESTIONNAIRE: Questionnaire = {
  version: 1,
  fields: {
    mood: true,
    stress: true,
    sleep_quality: true,
    craving_intensity: true,
    environment: true,
    social_context: true,
    substance_use: false,
  },
  custom: [],
};

/** Parses a stored questionnaire, falling back to the default if it is malformed. */
export function parseQuestionnaire(raw: unknown): Questionnaire {
  const parsed = questionnaireSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_QUESTIONNAIRE;
}

export const scheduleSchema = z.object({
  prompts_per_day: z.number().int().min(1, "At least 1 prompt a day.").max(6, "At most 6."),
  duration_days: z.number().int().min(1, "At least 1 day.").max(365, "At most 365 days."),
  timezone: z.string().refine(isValidTimeZone, "Unknown time zone."),
});
export type Schedule = z.infer<typeof scheduleSchema>;

export const DEFAULT_SCHEDULE: Schedule = {
  prompts_per_day: 1,
  duration_days: 30,
  timezone: DEFAULT_TIME_ZONE,
};

export function parseSchedule(raw: unknown): Schedule {
  const parsed = scheduleSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_SCHEDULE;
}

const titleSchema = trimmed(120).min(1, "Give the study a title.");
const descriptionSchema = trimmed(2000);

export const createStudySchema = z.object({
  title: titleSchema,
  description: descriptionSchema.default(""),
});
export type CreateStudyInput = z.infer<typeof createStudySchema>;

export const studySettingsSchema = z
  .object({
    title: titleSchema,
    description: descriptionSchema,
    status: z.enum(STUDY_STATUSES),
    synthetic: z.boolean(),
    ethics_approval_ref: trimmed(200),
    questionnaire: questionnaireSchema,
    schedule: scheduleSchema,
  })
  .refine((s) => s.synthetic || s.ethics_approval_ref.length > 0, {
    message:
      "Real participant data needs an ethics approval reference. Studies stay synthetic until one is recorded.",
    path: ["ethics_approval_ref"],
  });
export type StudySettings = z.infer<typeof studySettingsSchema>;

export const joinCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[2-9A-HJ-NP-Z]{8}$/, "A join code is 8 letters and digits, for example K7M2Q9TX.");

const score = (label: string) =>
  z
    .number({ error: `Answer “${label}”.` })
    .int(`${label} must be a whole number.`)
    .min(0, `${label} must be between 0 and 10.`)
    .max(10, `${label} must be between 0 and 10.`);

/** The observation a participant submits, validated against the study's questionnaire. */
export function observationSchema(questionnaire: Questionnaire, now: Date = new Date()) {
  const { fields } = questionnaire;
  const answers: Record<string, z.ZodType> = {};
  for (const question of questionnaire.custom) {
    answers[question.id] =
      question.type === "scale"
        ? score(question.prompt).nullable().optional()
        : z.string().trim().max(MAX_TEXT_ANSWER).nullable().optional();
  }
  const required = <T extends z.ZodType>(on: boolean, schema: T) =>
    on ? schema : z.null().optional();

  return z
    .object({
      observed_at: z.iso.datetime({ offset: true, error: "Invalid time." }),
      mood: required(fields.mood, score("Mood")),
      stress: required(fields.stress, score("Stress")),
      sleep_quality: required(fields.sleep_quality, score("Sleep quality")),
      craving_intensity: required(fields.craving_intensity, score("Craving intensity")),
      environment: required(fields.environment, z.enum(ENVIRONMENTS, { error: "Choose where." })),
      social_context: required(
        fields.social_context,
        z.enum(SOCIAL_CONTEXTS, { error: "Choose who with." }),
      ),
      substance_use: fields.substance_use ? z.boolean().nullable() : z.null().optional(),
      answers: z.strictObject(answers).default({}),
    })
    .refine(
      (o) => {
        const at = Date.parse(o.observed_at);
        return at <= now.getTime() + 5 * 60_000 && at >= now.getTime() - 7 * 86_400_000;
      },
      { message: "The time must be within the last 7 days.", path: ["observed_at"] },
    );
}
export type ObservationInput = z.infer<ReturnType<typeof observationSchema>>;

export const seedSchema = z.object({
  participants: z.number().int().min(3, "At least 3 participants.").max(60, "At most 60."),
  days: z.number().int().min(7, "At least 7 days.").max(60, "At most 60 days."),
  seed: z
    .number()
    .int()
    .min(0)
    .max(2 ** 31 - 1),
});
export type SeedInput = z.infer<typeof seedSchema>;
