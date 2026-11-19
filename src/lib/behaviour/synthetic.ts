/**
 * Synthetic BehaviourLab data. Every participant and observation produced here is invented by a
 * seeded PRNG: same seed, same data. The built-in associations are deliberately plausible so
 * the analytics have something to find, and they are documented here so nobody mistakes them
 * for findings:
 *
 *   craving ≈ baseline + 0.45·stress − 0.30·(sleep − 6) − 0.20·(mood − 5)
 *             + 1.2 in the evening + 1.0 at a social venue + noise
 *   mood    ≈ 6.5 − 0.35·(stress − 4) + 0.25·(sleep − 6) + noise
 *
 * Each synthetic participant also has an adherence rate, so some scheduled prompts are missed.
 */
import { mulberry32 } from "@/lib/models/prng";

import {
  ENVIRONMENTS,
  type Environment,
  type Questionnaire,
  SOCIAL_CONTEXTS,
  type SocialContext,
} from "./schemas";
import { addDays, localDateKey, wallTime, zonedTimeToUtc } from "./time";

export const PSEUDONYM_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const MAX_SYNTHETIC_OBSERVATIONS = 20_000;

export interface SyntheticOptions {
  seed: number;
  participants: number;
  days: number;
  promptsPerDay: number;
  timeZone: string;
  questionnaire: Questionnaire;
  /** The last day of data is the local day containing `now`; prompts after `now` are skipped. */
  now: Date;
  /** Pseudonyms already used in the study, so a second run never collides. */
  taken?: ReadonlySet<string>;
}

export interface SyntheticParticipant {
  pseudonym: string;
  /** Enrolment: the start of the first synthetic day. */
  created_at: string;
}

export interface SyntheticObservation {
  participant: number;
  observed_at: string;
  mood: number | null;
  stress: number | null;
  sleep_quality: number | null;
  craving_intensity: number | null;
  environment: Environment | null;
  social_context: SocialContext | null;
  substance_use: boolean | null;
  answers: Record<string, number | string>;
}

export interface SyntheticData {
  synthetic: true;
  participants: SyntheticParticipant[];
  observations: SyntheticObservation[];
}

type Random = () => number;

function normal(random: Random): number {
  // Box-Muller; 1 - u keeps the logarithm finite.
  const u = 1 - random();
  const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const clampScore = (value: number): number => Math.min(10, Math.max(0, Math.round(value)));

function pick<T>(random: Random, items: readonly T[], weights: readonly number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i] ?? 0;
    if (r < 0) {
      return items[i] as T;
    }
  }
  return items[items.length - 1] as T;
}

export function syntheticPseudonym(random: Random): string {
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += PSEUDONYM_ALPHABET[Math.floor(random() * PSEUDONYM_ALPHABET.length)];
  }
  return `S-${code}`;
}

/**
 * Local prompt hours, spread evenly between 08:00 and 22:00. A once-a-day schedule returns an
 * empty list: that prompt comes at a random waking hour each day, as in signal-contingent EMA.
 */
export function promptHours(promptsPerDay: number): number[] {
  if (promptsPerDay <= 1) {
    return [];
  }
  const step = 14 / (promptsPerDay - 1);
  return Array.from({ length: promptsPerDay }, (_, i) => 8 + i * step);
}

function environmentFor(random: Random, hour: number, weekend: boolean): Environment {
  const evening = hour >= 18;
  const weights = [
    evening ? 5 : 3, // home
    !weekend && hour >= 8 && hour < 17 ? 6 : 0.5, // work_or_school
    evening ? (weekend ? 3 : 1.5) : 0.4, // social_venue
    1, // outdoors
    hour < 9 || (hour >= 17 && hour < 19) ? 2 : 0.6, // transit
    0.4, // other
  ];
  return pick(random, ENVIRONMENTS, weights);
}

function socialFor(random: Random, environment: Environment): SocialContext {
  const weights: Record<Environment, number[]> = {
    home: [4, 4, 1, 0.2, 0.1, 0.3],
    work_or_school: [1.5, 0.2, 1, 5, 0.5, 0.3],
    social_venue: [0.3, 0.8, 5, 1, 1.5, 0.3],
    outdoors: [2, 1, 2, 0.5, 1, 0.3],
    transit: [3, 0.5, 0.8, 0.5, 2, 0.2],
    other: [1, 1, 1, 1, 1, 1],
  };
  return pick(random, SOCIAL_CONTEXTS, weights[environment]);
}

export function generateSyntheticData(options: SyntheticOptions): SyntheticData {
  const { questionnaire, timeZone, promptsPerDay } = options;
  const { fields } = questionnaire;
  const random = mulberry32(options.seed);
  const today = localDateKey(options.now, timeZone);
  const firstDay = addDays(today, -(options.days - 1));
  const [y, m, d] = firstDay.split("-").map(Number);
  const enrolment = zonedTimeToUtc(
    { year: y ?? 1970, month: m ?? 1, day: d ?? 1, hour: 0, minute: 0 },
    timeZone,
  ).toISOString();

  const used = new Set(options.taken ?? []);
  const participants: SyntheticParticipant[] = [];
  for (let i = 0; i < options.participants; i++) {
    let pseudonym = syntheticPseudonym(random);
    for (let tries = 0; used.has(pseudonym) && tries < 1000; tries++) {
      pseudonym = syntheticPseudonym(random);
    }
    used.add(pseudonym);
    participants.push({ pseudonym, created_at: enrolment });
  }

  const traits = participants.map(() => ({
    baseline: 2.5 + 1.2 * normal(random),
    stressLevel: 4 + 1.2 * normal(random),
    sleepLevel: 6.3 + 1.0 * normal(random),
    adherence: 0.6 + 0.38 * random(),
    disclosure: 0.6 + 0.35 * random(),
  }));

  const hours = promptHours(promptsPerDay);
  const observations: SyntheticObservation[] = [];
  for (let day = 0; day < options.days; day++) {
    const key = addDays(firstDay, day);
    const [year, month, date] = key.split("-").map(Number);
    const weekday = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, date ?? 1)).getUTCDay();
    const weekend = weekday === 0 || weekday === 6;

    participants.forEach((_, p) => {
      const t = traits[p];
      if (!t) {
        return;
      }
      const sleep = clampScore(t.sleepLevel + (weekend ? 0.4 : 0) + 1.6 * normal(random));
      const today = hours.length > 0 ? hours : [8 + 14 * random()];
      for (const base of today) {
        // Draw every random number up front so skipping a prompt keeps later draws aligned.
        const answered = random() < t.adherence;
        const jitter = Math.round(normal(random) * 40 + (random() - 0.5) * 20);
        const stress = clampScore(t.stressLevel + (weekend ? -0.8 : 0.4) + 1.8 * normal(random));
        const minutes = Math.min(23 * 60 + 50, Math.max(6 * 60, Math.round(base * 60) + jitter));
        const hour = Math.floor(minutes / 60);
        const environment = environmentFor(random, hour, weekend);
        const social = socialFor(random, environment);
        const mood = clampScore(
          6.5 - 0.35 * (stress - 4) + 0.25 * (sleep - 6) + 1.3 * normal(random),
        );
        const craving = clampScore(
          t.baseline +
            0.45 * stress -
            0.3 * (sleep - 6) -
            0.2 * (mood - 5) +
            (hour >= 18 ? 1.2 : 0) +
            (environment === "social_venue" ? 1.0 : 0) +
            1.1 * normal(random),
        );
        const discloses = random() < t.disclosure;
        const usedSubstance = random() < 1 / (1 + Math.exp(-(-3.2 + 0.45 * craving)));
        const customDraws = questionnaire.custom.map(() => normal(random));

        const at = zonedTimeToUtc(
          {
            year: year ?? 1970,
            month: month ?? 1,
            day: date ?? 1,
            hour,
            minute: minutes % 60,
          },
          timeZone,
        );
        if (!answered || at.getTime() > options.now.getTime()) {
          continue;
        }

        const answers: Record<string, number | string> = {};
        questionnaire.custom.forEach((question, i) => {
          if (question.type === "scale") {
            answers[question.id] = clampScore(5 + 2 * (customDraws[i] ?? 0));
          }
        });

        observations.push({
          participant: p,
          observed_at: at.toISOString(),
          mood: fields.mood ? mood : null,
          stress: fields.stress ? stress : null,
          sleep_quality: fields.sleep_quality ? sleep : null,
          craving_intensity: fields.craving_intensity ? craving : null,
          environment: fields.environment ? environment : null,
          social_context: fields.social_context ? social : null,
          substance_use: fields.substance_use && discloses ? usedSubstance : null,
          answers,
        });
      }
    });
  }

  return { synthetic: true, participants, observations };
}

/** Local hour of a generated observation; exported for tests. */
export function observationHour(observation: SyntheticObservation, timeZone: string): number {
  return wallTime(new Date(observation.observed_at), timeZone).hour;
}
