import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { ResearchMode } from "./query";
import { type ReferenceLike, identityKeys, toCacheRow, toLiteratureReference } from "./references";
import type { LiteratureReference, ReferenceView, SavedState } from "./types";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export const REFERENCE_COLUMNS =
  "id, source, pmid, pmcid, doi, title, authors, journal, year, abstract, publication_types, url, evidence";

/** A `literature_references` row as PostgREST returns it. */
export interface CachedReferenceRow extends ReferenceLike {
  id: string;
}

export function viewFromRow(row: CachedReferenceRow, saved: SavedState | null): ReferenceView {
  return { ...toLiteratureReference(row), cacheId: row.id, saved };
}

export const CACHE_UNAVAILABLE =
  "Results could not be added to your library cache, so saving is unavailable for now.";

/**
 * Adds references to the shared cache and attaches each one's cache id and the user's save state.
 * Caching never blocks results: on any database problem the references come back unsaved-able
 * with a warning instead.
 */
export async function cacheAndDecorate(
  supabase: Supabase,
  references: readonly LiteratureReference[],
): Promise<{ views: ReferenceView[]; warning: string | null }> {
  const unsaveable = () => references.map((r) => ({ ...r, cacheId: null, saved: null }));
  const rows = references.map(toCacheRow).filter((row) => row !== null);
  if (rows.length === 0) {
    return { views: unsaveable(), warning: null };
  }

  const { data, error } = await supabase.rpc("cache_literature_references", { p_refs: rows });
  if (error || !Array.isArray(data)) {
    console.error("cache_literature_references failed", error?.code, error?.message);
    return { views: unsaveable(), warning: CACHE_UNAVAILABLE };
  }

  const idByKey = new Map<string, string>();
  const cached = data as {
    reference_id: string;
    ref_pmid: string | null;
    ref_doi: string | null;
  }[];
  for (const row of cached) {
    for (const key of identityKeys({ pmid: row.ref_pmid, doi: row.ref_doi })) {
      idByKey.set(key, row.reference_id);
    }
  }
  const cacheIdOf = (reference: LiteratureReference) => {
    const row = toCacheRow(reference);
    if (!row) {
      return null;
    }
    for (const key of identityKeys(row)) {
      const id = idByKey.get(key);
      if (id) {
        return id;
      }
    }
    return null;
  };

  const ids = references.map(cacheIdOf);
  const saved = await savedStateFor(
    supabase,
    ids.filter((id) => id !== null),
  );
  return {
    views: references.map((reference, i) => {
      const cacheId = ids[i] ?? null;
      return { ...reference, cacheId, saved: cacheId ? (saved.get(cacheId) ?? null) : null };
    }),
    warning: null,
  };
}

/** The signed-in user's save state for the given cached references. RLS limits it to own rows. */
export async function savedStateFor(
  supabase: Supabase,
  referenceIds: readonly string[],
): Promise<Map<string, SavedState>> {
  const map = new Map<string, SavedState>();
  if (referenceIds.length === 0) {
    return map;
  }
  const { data, error } = await supabase
    .from("saved_references")
    .select("id, note, reference_id")
    .in("reference_id", [...new Set(referenceIds)])
    .returns<{ id: string; note: string; reference_id: string }[]>();
  if (error || !data) {
    return map;
  }
  for (const row of data) {
    map.set(row.reference_id, { id: row.id, note: row.note });
  }
  return map;
}

/** Records a query in the user's own history. Failure to record never fails the search. */
export async function recordQuery(supabase: Supabase, query: string, mode: ResearchMode) {
  const { error } = await supabase.from("research_queries").insert({ query, mode });
  if (error) {
    console.error("research_queries insert failed", error.code, error.message);
  }
}

export interface SavedReference extends ReferenceView {
  savedAt: string;
}

/** Everything the signed-in user has saved, newest first. Null if the tables are unavailable. */
export async function listSavedReferences(): Promise<SavedReference[] | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("saved_references")
    .select(`id, note, created_at, reference:literature_references (${REFERENCE_COLUMNS})`)
    .order("created_at", { ascending: false })
    .limit(500)
    .returns<
      {
        id: string;
        note: string;
        created_at: string;
        reference: CachedReferenceRow | null;
      }[]
    >();
  if (error || !data) {
    return null;
  }
  return data.flatMap((row) =>
    row.reference
      ? [
          {
            ...viewFromRow(row.reference, { id: row.id, note: row.note }),
            savedAt: row.created_at,
          },
        ]
      : [],
  );
}

export interface QueryHistoryItem {
  id: string;
  query: string;
  mode: ResearchMode;
  created_at: string;
}

/** The user's most recent distinct queries, newest first. Empty if the table is unavailable. */
export async function listRecentQueries(limit = 8): Promise<QueryHistoryItem[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("research_queries")
    .select("id, query, mode, created_at")
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<QueryHistoryItem[]>();
  if (error || !data) {
    return [];
  }
  const seen = new Set<string>();
  const recent: QueryHistoryItem[] = [];
  for (const item of data) {
    const key = `${item.mode}:${item.query.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      recent.push(item);
    }
    if (recent.length === limit) {
      break;
    }
  }
  return recent;
}
