"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  ApiError,
  type AssociationsResult,
  type BehaviourObservationRow,
  type BehaviourSummary,
  api,
} from "@/lib/api/client";
import { getSessionUser } from "@/lib/auth";
import { CURRENT_CONSENT_VERSION, consentTextHash } from "@/lib/behaviour/consent";
import {
  createStudySchema,
  joinCodeSchema,
  observationSchema,
  seedSchema,
  studySettingsSchema,
} from "@/lib/behaviour/schemas";
import {
  getMyParticipantId,
  getMyParticipation,
  getStudy,
  loadStudyData,
  studyIdSchema,
} from "@/lib/behaviour/server";
import { MAX_SYNTHETIC_OBSERVATIONS, generateSyntheticData } from "@/lib/behaviour/synthetic";
import { toZonedIso } from "@/lib/behaviour/time";
import { SlidingWindowLimiter, describeWait } from "@/lib/security/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

type Failure = { ok: false; error: string };

const fail = (error: string): Failure => ({ ok: false, error });

const NOT_SIGNED_IN = fail("You need to be signed in.");
const NOT_FOUND = fail("Study not found, or you are not a member of it.");

/** Rows the analytics API accepts per request (api/app/behaviour/schemas.py MAX_ROWS). */
const API_MAX_ROWS = 20_000;
/** Fixed bootstrap seed, so re-running the analysis on the same rows gives the same intervals. */
const ANALYSIS_SEED = 20261120;

/**
 * Join attempts per user per hour, checked before the database is asked. The database throttles
 * failed codes too (10 per hour, shared by every web instance); this only stops a burst early.
 */
const joinLimiter = new SlidingWindowLimiter({ limit: 10, windowMs: 60 * 60 * 1000 });

/** Turns a PostgREST/Postgres error into something a person can act on. */
function databaseError(error: { code?: string; message: string }, fallback: string): Failure {
  switch (error.code) {
    case "42501":
      return fail("You do not have permission to do that.");
    case "23514":
    case "P0002":
    case "22023":
    case "PT429":
      // Our own CHECK and RPC messages are written for people.
      return fail(error.message);
    case "23505":
      return fail("That already exists. Please try again.");
    default:
      return fail(fallback);
  }
}

function invalid(error: z.ZodError, fallback = "Invalid input."): Failure {
  return fail(error.issues[0]?.message ?? fallback);
}

function refreshBehaviour() {
  revalidatePath("/behaviour", "layout");
}

export async function createStudyAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  if (!(await getSessionUser())) {
    return NOT_SIGNED_IN;
  }
  const parsed = createStudySchema.safeParse(raw);
  if (!parsed.success) {
    return invalid(parsed.error);
  }
  const supabase = await createSupabaseServerClient();
  // Studies are synthetic by default; switching to real data happens in settings, with an
  // ethics approval reference that the database CHECK insists on.
  const { data, error } = await supabase
    .from("studies")
    .insert({ title: parsed.data.title, description: parsed.data.description, synthetic: true })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) {
    return databaseError(error ?? { message: "" }, "Could not create the study.");
  }
  refreshBehaviour();
  return { ok: true, data };
}

export async function updateStudySettingsAction(
  studyId: string,
  raw: unknown,
): Promise<ActionResult<null>> {
  const user = await getSessionUser();
  if (!user) {
    return NOT_SIGNED_IN;
  }
  const study = await getStudy(studyId);
  if (!study) {
    return NOT_FOUND;
  }
  if (study.owner_id !== user.id) {
    return fail("Only the study owner can change its settings.");
  }
  const parsed = studySettingsSchema.safeParse(raw);
  if (!parsed.success) {
    return invalid(parsed.error);
  }
  const s = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("studies")
    .update({
      title: s.title,
      description: s.description,
      status: s.status,
      synthetic: s.synthetic,
      ethics_approval_ref: s.ethics_approval_ref || null,
      questionnaire: s.questionnaire,
      schedule: s.schedule,
    })
    .eq("id", study.id)
    .select("id");
  if (error) {
    return databaseError(error, "Could not save the settings.");
  }
  if (!data || data.length === 0) {
    return fail("Only the study owner can change its settings.");
  }
  refreshBehaviour();
  return { ok: true, data: null };
}

export async function deleteStudyAction(studyId: string): Promise<ActionResult<null>> {
  const user = await getSessionUser();
  if (!user) {
    return NOT_SIGNED_IN;
  }
  const study = await getStudy(studyId);
  if (!study || study.owner_id !== user.id) {
    return fail("Only the study owner can delete a study.");
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("studies").delete().eq("id", study.id);
  if (error) {
    return databaseError(error, "Could not delete the study.");
  }
  refreshBehaviour();
  return { ok: true, data: null };
}

const joinSchema = z.object({
  code: joinCodeSchema,
  consentVersion: z.literal(CURRENT_CONSENT_VERSION, {
    error: "The consent text has changed. Reload the page and read the current version.",
  }),
  agreed: z.literal(true, { error: "Tick the box to confirm your consent." }),
});

export async function joinStudyAction(
  raw: unknown,
): Promise<ActionResult<{ pseudonym: string; studyId: string }>> {
  const user = await getSessionUser();
  if (!user) {
    return NOT_SIGNED_IN;
  }
  const wait = joinLimiter.take(user.id);
  if (wait > 0) {
    return fail(`Too many join attempts. Try again in ${describeWait(wait)}.`);
  }
  const parsed = joinSchema.safeParse(raw);
  if (!parsed.success) {
    return invalid(parsed.error);
  }
  // The hash is computed here from the server's copy of the text, never taken from the browser.
  const hash = await consentTextHash(parsed.data.consentVersion);
  if (!hash) {
    return fail("Unknown consent version.");
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("join_study", {
    p_join_code: parsed.data.code,
    p_consent_version: parsed.data.consentVersion,
    p_consent_text_hash: hash,
  });
  if (error || !Array.isArray(data)) {
    return databaseError(error ?? { message: "" }, "Could not join the study.");
  }
  // One row on success; no rows when no active study uses the code (counted as a failed try).
  const joined = (data as { joined_study_id: string; joined_pseudonym: string }[])[0];
  if (!joined) {
    return fail("No active study uses that join code.");
  }
  refreshBehaviour();
  return {
    ok: true,
    data: { pseudonym: joined.joined_pseudonym, studyId: joined.joined_study_id },
  };
}

export async function submitObservationAction(
  studyId: string,
  raw: unknown,
): Promise<ActionResult<null>> {
  if (!(await getSessionUser())) {
    return NOT_SIGNED_IN;
  }
  const participation = await getMyParticipation(studyId);
  if (!participation) {
    return fail("You are not taking part in this study.");
  }
  if (!participation.consent_active) {
    return fail("You have withdrawn your consent, so no new observations are accepted.");
  }
  if (participation.status !== "active") {
    return fail("This study is not collecting observations at the moment.");
  }
  const parsed = observationSchema(participation.questionnaire).safeParse(raw);
  if (!parsed.success) {
    return invalid(parsed.error, "Please check your answers.");
  }
  const participantId = await getMyParticipantId(studyId);
  if (!participantId) {
    return fail("You are not taking part in this study.");
  }
  const o = parsed.data;
  const answers = Object.fromEntries(
    Object.entries(o.answers).filter(([, value]) => value !== null && value !== undefined),
  );
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("observations").insert({
    participant_id: participantId,
    study_id: studyId,
    observed_at: o.observed_at,
    mood: o.mood ?? null,
    stress: o.stress ?? null,
    sleep_quality: o.sleep_quality ?? null,
    craving_intensity: o.craving_intensity ?? null,
    environment: o.environment ?? null,
    social_context: o.social_context ?? null,
    substance_use: o.substance_use ?? null,
    answers,
  });
  if (error) {
    return databaseError(error, "Could not save your answers.");
  }
  refreshBehaviour();
  return { ok: true, data: null };
}

export async function withdrawConsentAction(
  studyId: string,
  deleteData: boolean,
): Promise<ActionResult<{ withdrawn: number }>> {
  if (!(await getSessionUser())) {
    return NOT_SIGNED_IN;
  }
  if (!studyIdSchema.safeParse(studyId).success) {
    return fail("Unknown study.");
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("withdraw_consent", {
    p_study_id: studyId,
    p_delete_data: deleteData === true,
  });
  if (error) {
    return databaseError(error, "Could not withdraw consent.");
  }
  refreshBehaviour();
  return { ok: true, data: { withdrawn: typeof data === "number" ? data : 0 } };
}

export async function seedSyntheticAction(
  studyId: string,
  raw: unknown,
): Promise<ActionResult<{ participants: number; observations: number }>> {
  if (!(await getSessionUser())) {
    return NOT_SIGNED_IN;
  }
  const study = await getStudy(studyId);
  if (!study) {
    return NOT_FOUND;
  }
  if (!study.synthetic) {
    return fail("Synthetic data can only be generated for synthetic studies.");
  }
  const parsed = seedSchema.safeParse(raw);
  if (!parsed.success) {
    return invalid(parsed.error);
  }
  const { participants, days, seed } = parsed.data;
  const prompts = study.schedule.prompts_per_day;
  if (participants * days * prompts > MAX_SYNTHETIC_OBSERVATIONS) {
    return fail(
      `That is up to ${participants * days * prompts} observations; the limit is ${MAX_SYNTHETIC_OBSERVATIONS}. Use fewer participants or days.`,
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data: existing } = await supabase
    .from("participants")
    .select("pseudonym")
    .eq("study_id", study.id)
    .returns<{ pseudonym: string }[]>();
  const generated = generateSyntheticData({
    seed,
    participants,
    days,
    promptsPerDay: prompts,
    timeZone: study.schedule.timezone,
    questionnaire: study.questionnaire,
    now: new Date(),
    taken: new Set((existing ?? []).map((p) => p.pseudonym)),
  });

  const { data: inserted, error } = await supabase
    .from("participants")
    .insert(
      generated.participants.map((p) => ({
        study_id: study.id,
        pseudonym: p.pseudonym,
        synthetic: true,
        created_at: p.created_at,
      })),
    )
    .select("id, pseudonym")
    .returns<{ id: string; pseudonym: string }[]>();
  if (error || !inserted) {
    return databaseError(error ?? { message: "" }, "Could not create synthetic participants.");
  }
  const idByPseudonym = new Map(inserted.map((p) => [p.pseudonym, p.id]));
  const rows = generated.observations.flatMap((o) => {
    const pseudonym = generated.participants[o.participant]?.pseudonym;
    const participantId = pseudonym ? idByPseudonym.get(pseudonym) : undefined;
    if (!participantId) {
      return [];
    }
    return [
      {
        participant_id: participantId,
        study_id: study.id,
        observed_at: o.observed_at,
        mood: o.mood,
        stress: o.stress,
        sleep_quality: o.sleep_quality,
        craving_intensity: o.craving_intensity,
        environment: o.environment,
        social_context: o.social_context,
        substance_use: o.substance_use,
        answers: o.answers,
      },
    ];
  });

  for (let i = 0; i < rows.length; i += 1000) {
    const { error: batchError } = await supabase
      .from("observations")
      .insert(rows.slice(i, i + 1000));
    if (batchError) {
      // Roll back this run: deleting the participants cascades to their observations.
      await supabase
        .from("participants")
        .delete()
        .in(
          "id",
          inserted.map((p) => p.id),
        );
      return databaseError(batchError, "Could not save the synthetic observations.");
    }
  }
  refreshBehaviour();
  return { ok: true, data: { participants: inserted.length, observations: rows.length } };
}

export async function clearSyntheticAction(
  studyId: string,
  includePractice = false,
): Promise<ActionResult<{ deleted: number }>> {
  if (!(await getSessionUser())) {
    return NOT_SIGNED_IN;
  }
  const study = await getStudy(studyId);
  if (!study) {
    return NOT_FOUND;
  }
  const supabase = await createSupabaseServerClient();
  // By default only generated (S-) participants. People who joined a synthetic (practice) study
  // are removed only when asked, for example before the study switches to real data.
  let query = supabase.from("participants").delete().eq("study_id", study.id).eq("synthetic", true);
  if (includePractice !== true) {
    query = query.like("pseudonym", "S-%");
  }
  const { data, error } = await query.select("id");
  if (error) {
    return databaseError(error, "Could not delete the synthetic data.");
  }
  refreshBehaviour();
  return { ok: true, data: { deleted: data?.length ?? 0 } };
}

export interface StudyAnalysis {
  associations: AssociationsResult;
  summary: BehaviourSummary;
  rowsSent: number;
  truncated: boolean;
}

export async function runAnalysisAction(studyId: string): Promise<ActionResult<StudyAnalysis>> {
  if (!(await getSessionUser())) {
    return NOT_SIGNED_IN;
  }
  const study = await getStudy(studyId);
  if (!study) {
    return NOT_FOUND;
  }
  let data: Awaited<ReturnType<typeof loadStudyData>>;
  try {
    data = await loadStudyData(study.id, API_MAX_ROWS);
  } catch {
    return fail("Could not read the study's observations.");
  }

  // The API needs a stable key per participant for its cluster bootstrap, not the pseudonym:
  // send an opaque per-request index instead.
  const keys = new Map(data.participants.map((p, i) => [p.id, `k${i}`]));
  const rows: BehaviourObservationRow[] = data.observations.map((o) => ({
    observed_at: toZonedIso(new Date(o.observed_at), study.schedule.timezone),
    participant: keys.get(o.participant_id) ?? null,
    mood: o.mood,
    stress: o.stress,
    sleep_quality: o.sleep_quality,
    craving_intensity: o.craving_intensity,
  }));

  try {
    const [associations, summary] = await Promise.all([
      api.behaviourAssociations({ rows, synthetic: study.synthetic, seed: ANALYSIS_SEED }),
      api.behaviourSummary({ rows, synthetic: study.synthetic }),
    ]);
    return {
      ok: true,
      data: { associations, summary, rowsSent: rows.length, truncated: data.truncated },
    };
  } catch (error) {
    return fail(error instanceof ApiError ? error.message : "The analysis could not be run.");
  }
}
