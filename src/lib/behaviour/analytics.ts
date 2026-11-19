/**
 * Aggregate, descriptive summaries for the study dashboard. Everything here is computed on the
 * server and only the aggregates reach the browser. Nothing is inferential: the association
 * analysis (with uncertainty) lives in the API, see docs/models/behaviour-associations.md.
 */
import type { ConsentRecord, ObservationRecord, ParticipantRecord } from "./records";
import {
  ENVIRONMENTS,
  ENVIRONMENT_LABELS,
  SOCIAL_CONTEXTS,
  SOCIAL_CONTEXT_LABELS,
  type Schedule,
} from "./schemas";
import { addDays, daysBetween, localDateKey, localHour } from "./time";

/** Hourly means from fewer observations than this are suppressed as too unstable to show. */
export const MIN_CELL = 5;
const MAX_DAYS = 400;

export interface DayPoint {
  date: string;
  count: number;
  mood: number | null;
  stress: number | null;
  craving: number | null;
}

export interface CountPoint {
  key: string;
  label: string;
  count: number;
}

export interface HourPoint {
  hour: number;
  label: string;
  n: number;
  mean: number | null;
}

export interface AdherencePoint {
  pseudonym: string;
  synthetic: boolean;
  consent: "active" | "withdrawn";
  expected: number;
  observed: number;
  missing: number;
  completion: number | null;
}

export interface DashboardData {
  totals: {
    participants: number;
    activeConsents: number;
    withdrawn: number;
    observations: number;
    firstDay: string | null;
    lastDay: string | null;
    completion: number | null;
  };
  days: DayPoint[];
  craving: CountPoint[];
  environment: CountPoint[];
  social: CountPoint[];
  hours: HourPoint[];
  adherence: AdherencePoint[];
}

const mean = (sum: number, n: number): number | null =>
  n > 0 ? Math.round((sum / n) * 100) / 100 : null;

function consentStatus(
  participantId: string,
  consents: readonly ConsentRecord[],
): { active: boolean; withdrawnAt: string | null } {
  const own = consents.filter((c) => c.participant_id === participantId);
  if (own.length === 0) {
    // Seeded synthetic participants have no consent row; they never withdraw.
    return { active: true, withdrawnAt: null };
  }
  if (own.some((c) => c.withdrawn_at === null)) {
    return { active: true, withdrawnAt: null };
  }
  const last = own.map((c) => c.withdrawn_at ?? "").sort();
  return { active: false, withdrawnAt: last.at(-1) ?? null };
}

export function computeDashboard(input: {
  participants: readonly ParticipantRecord[];
  consents: readonly ConsentRecord[];
  observations: readonly ObservationRecord[];
  schedule: Schedule;
  now: Date;
}): DashboardData {
  const { schedule, now } = input;
  const tz = schedule.timezone;
  const today = localDateKey(now, tz);

  // Per-day series.
  const byDay = new Map<
    string,
    { count: number; mood: [number, number]; stress: [number, number]; craving: [number, number] }
  >();
  const cravingCounts = Array.from({ length: 11 }, () => 0);
  const environment = new Map<string, number>();
  const social = new Map<string, number>();
  const hours = Array.from({ length: 24 }, () => ({ n: 0, sum: 0 }));
  const perParticipantDays = new Map<string, string[]>();

  for (const o of input.observations) {
    const at = new Date(o.observed_at);
    const day = localDateKey(at, tz);
    let bucket = byDay.get(day);
    if (!bucket) {
      bucket = { count: 0, mood: [0, 0], stress: [0, 0], craving: [0, 0] };
      byDay.set(day, bucket);
    }
    bucket.count += 1;
    if (o.mood !== null) {
      bucket.mood = [bucket.mood[0] + o.mood, bucket.mood[1] + 1];
    }
    if (o.stress !== null) {
      bucket.stress = [bucket.stress[0] + o.stress, bucket.stress[1] + 1];
    }
    if (o.craving_intensity !== null) {
      bucket.craving = [bucket.craving[0] + o.craving_intensity, bucket.craving[1] + 1];
      cravingCounts[o.craving_intensity] = (cravingCounts[o.craving_intensity] ?? 0) + 1;
      const hour = hours[localHour(at, tz)];
      if (hour) {
        hour.n += 1;
        hour.sum += o.craving_intensity;
      }
    }
    const env = o.environment ?? "unanswered";
    environment.set(env, (environment.get(env) ?? 0) + 1);
    const ctx = o.social_context ?? "unanswered";
    social.set(ctx, (social.get(ctx) ?? 0) + 1);
    const list = perParticipantDays.get(o.participant_id) ?? [];
    list.push(day);
    perParticipantDays.set(o.participant_id, list);
  }

  const observedDays = [...byDay.keys()].sort();
  const firstDay = observedDays[0] ?? null;
  const lastDay = observedDays.at(-1) ?? null;
  const days: DayPoint[] = [];
  if (firstDay && lastDay) {
    const span = Math.min(daysBetween(firstDay, lastDay), MAX_DAYS - 1);
    const start = addDays(lastDay, -span);
    for (let i = 0; i <= span; i++) {
      const date = addDays(start, i);
      const b = byDay.get(date);
      days.push({
        date,
        count: b?.count ?? 0,
        mood: b ? mean(...b.mood) : null,
        stress: b ? mean(...b.stress) : null,
        craving: b ? mean(...b.craving) : null,
      });
    }
  }

  const breakdown = (
    counts: Map<string, number>,
    keys: readonly string[],
    labels: Record<string, string>,
  ): CountPoint[] => {
    const points = keys.map((key) => ({
      key,
      label: labels[key] ?? key,
      count: counts.get(key) ?? 0,
    }));
    const unanswered = counts.get("unanswered") ?? 0;
    return unanswered > 0
      ? [...points, { key: "unanswered", label: "Not answered", count: unanswered }]
      : points;
  };

  // Adherence against the schedule, per pseudonym.
  let expectedTotal = 0;
  let observedTotal = 0;
  let activeConsents = 0;
  const adherence: AdherencePoint[] = input.participants.map((p) => {
    const status = consentStatus(p.id, input.consents);
    if (status.active) {
      activeConsents += 1;
    }
    const enrolled = localDateKey(new Date(p.created_at), tz);
    let end = addDays(enrolled, schedule.duration_days - 1);
    if (daysBetween(today, end) > 0) {
      end = today;
    }
    if (status.withdrawnAt) {
      const withdrawn = localDateKey(new Date(status.withdrawnAt), tz);
      if (daysBetween(withdrawn, end) > 0) {
        end = withdrawn;
      }
    }
    const span = daysBetween(enrolled, end) + 1;
    const expected = span > 0 ? span * schedule.prompts_per_day : 0;
    const inWindow = (perParticipantDays.get(p.id) ?? []).filter(
      (d) => daysBetween(enrolled, d) >= 0 && daysBetween(d, end) >= 0,
    ).length;
    const observed = Math.min(inWindow, expected);
    expectedTotal += expected;
    observedTotal += observed;
    return {
      pseudonym: p.pseudonym,
      synthetic: p.synthetic,
      consent: status.active ? "active" : "withdrawn",
      expected,
      observed: inWindow,
      missing: expected - observed,
      completion: expected > 0 ? Math.round((observed / expected) * 1000) / 1000 : null,
    };
  });
  adherence.sort((a, b) => b.missing - a.missing || a.pseudonym.localeCompare(b.pseudonym));

  return {
    totals: {
      participants: input.participants.length,
      activeConsents,
      withdrawn: input.participants.length - activeConsents,
      observations: input.observations.length,
      firstDay,
      lastDay,
      completion:
        expectedTotal > 0 ? Math.round((observedTotal / expectedTotal) * 1000) / 1000 : null,
    },
    days,
    craving: cravingCounts.map((count, score) => ({
      key: String(score),
      label: String(score),
      count,
    })),
    environment: breakdown(environment, ENVIRONMENTS, ENVIRONMENT_LABELS),
    social: breakdown(social, SOCIAL_CONTEXTS, SOCIAL_CONTEXT_LABELS),
    hours: hours.map((h, hour) => ({
      hour,
      label: `${String(hour).padStart(2, "0")}:00`,
      n: h.n,
      mean: h.n >= MIN_CELL ? Math.round((h.sum / h.n) * 100) / 100 : null,
    })),
    adherence,
  };
}
