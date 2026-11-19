import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The signed-in user's own account data. Every query runs as the user through the publishable
 * key, so RLS limits it to their own rows; the explicit `eq` filters are belt and braces.
 */

export interface Profile {
  id: string;
  display_name: string | null;
  role: "student" | "researcher" | "admin";
  created_at: string;
  updated_at: string;
}

const EXPORT_PAGE_SIZE = 1000;

export async function getProfile(userId: string): Promise<Profile | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, role, created_at, updated_at")
    .eq("id", userId)
    .maybeSingle<Profile>();
  return error ? null : data;
}

export async function countExperiments(userId: string): Promise<number | null> {
  const supabase = await createSupabaseServerClient();
  const { count, error } = await supabase
    .from("experiments")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  return error ? null : (count ?? 0);
}

/** Only `display_name` is updatable: the column grant on `profiles` enforces that in SQL too. */
export async function updateDisplayName(userId: string, displayName: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ display_name: displayName })
    .eq("id", userId)
    .select("id");
  return !error && Array.isArray(data) && data.length === 1;
}

/** Deletes every experiment the user owns. Returns how many rows went, or null on failure. */
export async function deleteAllExperiments(userId: string): Promise<number | null> {
  const supabase = await createSupabaseServerClient();
  const { count, error } = await supabase
    .from("experiments")
    .delete({ count: "exact" })
    .eq("user_id", userId);
  return error ? null : (count ?? 0);
}

export interface UserDataExport {
  format: "neurotrack-export";
  version: 1;
  exported_at: string;
  notice: string;
  account: { id: string; email: string | null };
  profile: Profile | null;
  experiments: unknown[];
  research: { queries: unknown[]; saved_references: unknown[] };
  behaviour: {
    /** Studies you created or were added to as a researcher (metadata only). */
    studies: unknown[];
    /** Studies you joined as a participant, with your pseudonym and consent status. */
    participations: unknown[];
    /** Check-ins you submitted. Only readable while your consent is active. */
    observations: unknown[];
  };
}

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/**
 * Reads every row a query returns, EXPORT_PAGE_SIZE at a time. `page` must apply a stable order.
 * Returns null if any page fails, so a partial export is never offered as complete.
 */
async function readAll(
  page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>,
): Promise<unknown[] | null> {
  const rows: unknown[] = [];
  for (let from = 0; ; from += EXPORT_PAGE_SIZE) {
    const { data, error } = await page(from, from + EXPORT_PAGE_SIZE - 1);
    if (error || !data) return null;
    rows.push(...data);
    if (data.length < EXPORT_PAGE_SIZE) return rows;
  }
}

async function readBehaviour(
  supabase: Supabase,
  userId: string,
): Promise<UserDataExport["behaviour"] | null> {
  const [studies, participations, links] = await Promise.all([
    readAll((from, to) =>
      supabase
        .from("study_members")
        .select("role, created_at, study:studies(id, title, synthetic, status, created_at)")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .order("study_id", { ascending: true })
        .range(from, to),
    ),
    supabase.rpc("my_participations"),
    supabase.from("participant_links").select("participant_id").eq("user_id", userId),
  ]);
  if (!studies || participations.error || links.error) return null;

  const participantIds = (links.data ?? []).map(
    (l: { participant_id: string }) => l.participant_id,
  );
  const observations =
    participantIds.length === 0
      ? []
      : await readAll((from, to) =>
          supabase
            .from("observations")
            .select(
              "id, study_id, observed_at, mood, stress, sleep_quality, craving_intensity, " +
                "environment, social_context, substance_use, answers, created_at",
            )
            .in("participant_id", participantIds)
            .order("observed_at", { ascending: true })
            .order("id", { ascending: true })
            .range(from, to),
        );
  if (!observations) return null;

  return {
    studies,
    participations: Array.isArray(participations.data) ? participations.data : [],
    observations,
  };
}

/**
 * Everything NeuroTrack stores about the user that they can read: profile, experiments, research
 * history and BehaviourLab participation. Auth details (sign-in times, provider data) live in
 * Supabase Auth and are not readable through the publishable key; the privacy notice says so.
 */
export async function exportUserData(user: {
  id: string;
  email: string | null;
}): Promise<UserDataExport | null> {
  const supabase = await createSupabaseServerClient();
  const [profile, experiments, queries, saved, behaviour] = await Promise.all([
    getProfile(user.id),
    readAll((from, to) =>
      supabase
        .from("experiments")
        .select("id, module, kind, title, config, result, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
    readAll((from, to) =>
      supabase
        .from("research_queries")
        .select("id, query, mode, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
    readAll((from, to) =>
      supabase
        .from("saved_references")
        .select(
          "id, note, created_at, reference:literature_references(source, pmid, pmcid, doi, " +
            "title, authors, journal, year, url)",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
    readBehaviour(supabase, user.id),
  ]);
  if (!experiments || !queries || !saved || !behaviour) return null;

  return {
    format: "neurotrack-export",
    version: 1,
    exported_at: new Date().toISOString(),
    notice:
      "Your NeuroTrack profile, saved experiments, research history and BehaviourLab " +
      "participation. Educational and experimental data; not a clinical record.",
    account: { id: user.id, email: user.email },
    profile,
    experiments,
    research: { queries, saved_references: saved },
    behaviour,
  };
}
