import "server-only";

import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import {
  type ConsentRecord,
  OBSERVATION_COLUMNS,
  type ObservationRecord,
  type ParticipantRecord,
  type StudyRecord,
} from "./records";
import {
  type Questionnaire,
  type Schedule,
  type StudyStatus,
  parseQuestionnaire,
  parseSchedule,
} from "./schemas";

/** PostgREST returns at most 1000 rows per request; larger reads are paged. */
const PAGE = 1000;
/** Hard ceiling on rows read for one study view or export. */
export const MAX_STUDY_ROWS = 100_000;

export const studyIdSchema = z.uuid();

export interface Study extends Omit<StudyRecord, "questionnaire" | "schedule"> {
  questionnaire: Questionnaire;
  schedule: Schedule;
}

export interface StudyListItem {
  id: string;
  title: string;
  synthetic: boolean;
  status: StudyStatus;
  created_at: string;
  isOwner: boolean;
  participants: number;
}

export interface Participation {
  study_id: string;
  title: string;
  description: string;
  synthetic: boolean;
  status: StudyStatus;
  questionnaire: Questionnaire;
  schedule: Schedule;
  pseudonym: string;
  joined_at: string;
  consent_version: string;
  consent_active: boolean;
  observation_count: number;
}

export interface StudyPreview {
  title: string;
  description: string;
  synthetic: boolean;
  prompts_per_day: number;
  duration_days: number;
  already_joined: boolean;
}

const STUDY_COLUMNS =
  "id, owner_id, title, description, synthetic, ethics_approval_ref, join_code, questionnaire, schedule, status, created_at, updated_at";

function toStudy(row: StudyRecord): Study {
  return {
    ...row,
    questionnaire: parseQuestionnaire(row.questionnaire),
    schedule: parseSchedule(row.schedule),
  };
}

type PageResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/** Reads every page of an ordered query, up to `limit` rows. */
async function readAll<T>(
  page: (from: number, to: number) => PageResult<T>,
  limit = MAX_STUDY_ROWS,
): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  for (let from = 0; from < limit; from += PAGE) {
    const { data, error } = await page(from, Math.min(from + PAGE, limit) - 1);
    if (error) {
      throw new Error(error.message);
    }
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) {
      return { rows, truncated: false };
    }
  }
  return { rows, truncated: true };
}

/** Studies the caller runs (as owner or researcher). RLS hides everything else. */
export async function listMyStudies(userId: string): Promise<StudyListItem[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("studies")
    .select("id, title, synthetic, status, created_at, owner_id, participants(count)")
    .order("created_at", { ascending: false })
    .returns<
      {
        id: string;
        title: string;
        synthetic: boolean;
        status: StudyStatus;
        created_at: string;
        owner_id: string;
        participants: { count: number }[];
      }[]
    >();
  if (error || !data) {
    return [];
  }
  return data.map((row) => ({
    id: row.id,
    title: row.title,
    synthetic: row.synthetic,
    status: row.status,
    created_at: row.created_at,
    isOwner: row.owner_id === userId,
    participants: row.participants[0]?.count ?? 0,
  }));
}

export async function listMyParticipations(): Promise<Participation[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("my_participations");
  if (error || !Array.isArray(data)) {
    return [];
  }
  const rows = data as (Omit<Participation, "questionnaire" | "schedule"> & {
    questionnaire: unknown;
    schedule: unknown;
  })[];
  return rows.map((row) => ({
    ...row,
    questionnaire: parseQuestionnaire(row.questionnaire),
    schedule: parseSchedule(row.schedule),
  }));
}

export async function getMyParticipation(studyId: string): Promise<Participation | null> {
  if (!studyIdSchema.safeParse(studyId).success) {
    return null;
  }
  return (await listMyParticipations()).find((p) => p.study_id === studyId) ?? null;
}

/** The caller's own participant id in a study (from their link row), or null. */
export async function getMyParticipantId(studyId: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("participant_links")
    .select("participant_id")
    .eq("study_id", studyId)
    .maybeSingle<{ participant_id: string }>();
  return data?.participant_id ?? null;
}

/** A study the caller is a member of, or null (not found, not a member, or a bad id). */
export async function getStudy(studyId: string): Promise<Study | null> {
  if (!studyIdSchema.safeParse(studyId).success) {
    return null;
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("studies")
    .select(STUDY_COLUMNS)
    .eq("id", studyId)
    .maybeSingle<StudyRecord>();
  return error || !data ? null : toStudy(data);
}

export async function previewStudy(code: string): Promise<StudyPreview | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("preview_study", { p_join_code: code });
  if (error || !Array.isArray(data)) {
    return null;
  }
  return (data as StudyPreview[])[0] ?? null;
}

export interface StudyData {
  participants: ParticipantRecord[];
  consents: ConsentRecord[];
  observations: ObservationRecord[];
  truncated: boolean;
}

/** Everything a study member may read about a study's participants. Pseudonymous only. */
export async function loadStudyData(studyId: string, limit = MAX_STUDY_ROWS): Promise<StudyData> {
  const supabase = await createSupabaseServerClient();
  const [participants, observations] = await Promise.all([
    readAll<ParticipantRecord>((from, to) =>
      supabase
        .from("participants")
        .select("id, pseudonym, synthetic, created_at")
        .eq("study_id", studyId)
        .order("created_at")
        .order("id")
        .range(from, to),
    ),
    readAll<ObservationRecord>(
      (from, to) =>
        supabase
          .from("observations")
          .select(OBSERVATION_COLUMNS)
          .eq("study_id", studyId)
          .order("observed_at", { ascending: false })
          .order("id")
          .range(from, to),
      limit,
    ),
  ]);
  const ids = participants.rows.map((p) => p.id);
  const consents: ConsentRecord[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase
      .from("consents")
      .select("participant_id, consent_version, given_at, withdrawn_at")
      .in("participant_id", ids.slice(i, i + 200))
      .returns<ConsentRecord[]>();
    if (error) {
      throw new Error(error.message);
    }
    consents.push(...(data ?? []));
  }
  return {
    participants: participants.rows,
    consents,
    // Read newest first so a truncated read keeps the most recent data; show it oldest first.
    observations: observations.rows.reverse(),
    truncated: participants.truncated || observations.truncated,
  };
}
