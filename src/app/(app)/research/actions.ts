"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";

import { ApiError, api } from "@/lib/api/client";
import { getSessionUser } from "@/lib/auth";
import {
  MAX_SEARCH_LIMIT,
  answerInputSchema,
  libraryInputSchema,
  noteSchema,
  referenceIdSchema,
  searchInputSchema,
} from "@/lib/research/query";
import { toLiteratureReference } from "@/lib/research/references";
import {
  type CachedReferenceRow,
  REFERENCE_COLUMNS,
  cacheAndDecorate,
  recordQuery,
  savedStateFor,
  viewFromRow,
} from "@/lib/research/server";
import type {
  CitedAnswer,
  LiteratureSource,
  ReferenceView,
  SavedState,
  SearchOutcome,
} from "@/lib/research/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };
type Failure = { ok: false; error: string };

const fail = (error: string): Failure => ({ ok: false, error });
const NOT_SIGNED_IN = fail("You need to be signed in.");

function invalid(error: z.ZodError): Failure {
  return fail(error.issues[0]?.message ?? "Invalid input.");
}

/** Maps API failures to messages that say what is wrong and what to do about it. */
function apiFailure(error: unknown): Failure {
  if (error instanceof ApiError) {
    if (error.status === 502) {
      return fail(
        `${error.message} Europe PMC and PubMed are public services and are occasionally slow or down.`,
      );
    }
    if (error.status === 401) {
      return fail("Your session has expired. Sign in again to search.");
    }
    return fail(error.message);
  }
  console.error("research API call failed", error);
  return fail("Something went wrong while searching. Please try again.");
}

function databaseError(error: { code?: string }, fallback: string): Failure {
  switch (error.code) {
    case "42501":
      return fail("You do not have permission to do that.");
    case "23503":
      return fail("That reference is no longer in the library cache. Search for it again.");
    case "23514":
      return fail("That note is too long.");
    case "42P01":
    case "PGRST205":
      return fail("The research library is not set up yet (its database migration is missing).");
    default:
      return fail(fallback);
  }
}

export async function searchLiteratureAction(raw: unknown): Promise<ActionResult<SearchOutcome>> {
  if (!(await getSessionUser())) {
    return NOT_SIGNED_IN;
  }
  const parsed = searchInputSchema.safeParse(raw);
  if (!parsed.success) {
    return invalid(parsed.error);
  }
  let result: Awaited<ReturnType<typeof api.researchSearch>>;
  try {
    result = await api.researchSearch(parsed.data);
  } catch (error) {
    return apiFailure(error);
  }
  const supabase = await createSupabaseServerClient();
  const references = result.references.map(toLiteratureReference);
  const [{ views, warning }] = await Promise.all([
    cacheAndDecorate(supabase, references),
    recordQuery(supabase, parsed.data.q, "search"),
  ]);
  return {
    ok: true,
    data: {
      references: views,
      failedSources: (result.failed_sources ?? []) as LiteratureSource[],
      cacheWarning: warning,
    },
  };
}

export async function askQuestionAction(raw: unknown): Promise<ActionResult<CitedAnswer>> {
  if (!(await getSessionUser())) {
    return NOT_SIGNED_IN;
  }
  const parsed = answerInputSchema.safeParse(raw);
  if (!parsed.success) {
    return invalid(parsed.error);
  }
  let result: Awaited<ReturnType<typeof api.researchAnswer>>;
  try {
    result = await api.researchAnswer({
      question: parsed.data.question,
      max_sources: parsed.data.maxSources,
    });
  } catch (error) {
    return apiFailure(error);
  }
  const supabase = await createSupabaseServerClient();
  const [{ views }] = await Promise.all([
    cacheAndDecorate(supabase, result.sources.map(toLiteratureReference)),
    recordQuery(supabase, parsed.data.question, "answer"),
  ]);
  return {
    ok: true,
    data: {
      question: result.question,
      sentences: result.answer_sentences.map((sentence) => ({
        text: sentence.text,
        citations: sentence.citations,
        section: sentence.section ?? null,
      })),
      sources: views,
      provider: result.provider,
      providerNote: result.provider_note ?? null,
      removedUnsupported: result.removed_unsupported,
      failedSources: (result.failed_sources ?? []) as LiteratureSource[],
      disclaimer: result.disclaimer ?? "",
    },
  };
}

/** Full-text search over the user's own cached references (Postgres FTS; RLS scopes it). */
export async function searchLibraryAction(raw: unknown): Promise<ActionResult<ReferenceView[]>> {
  if (!(await getSessionUser())) {
    return NOT_SIGNED_IN;
  }
  const parsed = libraryInputSchema.safeParse(raw);
  if (!parsed.success) {
    return invalid(parsed.error);
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("literature_references")
    .select(REFERENCE_COLUMNS)
    .textSearch("search", parsed.data.q, { type: "websearch", config: "english" })
    .order("year", { ascending: false, nullsFirst: false })
    .limit(MAX_SEARCH_LIMIT)
    .returns<CachedReferenceRow[]>();
  if (error || !data) {
    return databaseError(error ?? {}, "Could not search your library.");
  }
  const [saved] = await Promise.all([
    savedStateFor(
      supabase,
      data.map((row) => row.id),
    ),
    recordQuery(supabase, parsed.data.q, "library"),
  ]);
  return { ok: true, data: data.map((row) => viewFromRow(row, saved.get(row.id) ?? null)) };
}

/** Saves a cached reference with a note, or updates the note if it is already saved. */
export async function saveReferenceAction(
  referenceId: unknown,
  note: unknown,
): Promise<ActionResult<SavedState>> {
  const user = await getSessionUser();
  if (!user) {
    return NOT_SIGNED_IN;
  }
  const id = referenceIdSchema.safeParse(referenceId);
  if (!id.success) {
    return invalid(id.error);
  }
  const text = noteSchema.safeParse(note ?? "");
  if (!text.success) {
    return invalid(text.error);
  }
  const supabase = await createSupabaseServerClient();
  const inserted = await supabase
    .from("saved_references")
    .insert({ reference_id: id.data, note: text.data })
    .select("id, note")
    .single<SavedState>();
  let data = inserted.data;
  let error = inserted.error;
  if (error?.code === "23505") {
    // Already saved: only the note can change (the table grants update on `note` alone).
    const updated = await supabase
      .from("saved_references")
      .update({ note: text.data })
      .eq("user_id", user.id)
      .eq("reference_id", id.data)
      .select("id, note")
      .single<SavedState>();
    data = updated.data;
    error = updated.error;
  }
  if (error || !data) {
    return databaseError(error ?? {}, "Could not save the reference.");
  }
  revalidatePath("/research/saved");
  return { ok: true, data };
}

export async function unsaveReferenceAction(referenceId: unknown): Promise<ActionResult<null>> {
  const user = await getSessionUser();
  if (!user) {
    return NOT_SIGNED_IN;
  }
  const id = referenceIdSchema.safeParse(referenceId);
  if (!id.success) {
    return invalid(id.error);
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("saved_references")
    .delete()
    .eq("user_id", user.id)
    .eq("reference_id", id.data);
  if (error) {
    return databaseError(error, "Could not remove the reference.");
  }
  revalidatePath("/research/saved");
  return { ok: true, data: null };
}

export async function clearHistoryAction(): Promise<ActionResult<null>> {
  const user = await getSessionUser();
  if (!user) {
    return NOT_SIGNED_IN;
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("research_queries").delete().eq("user_id", user.id);
  if (error) {
    return databaseError(error, "Could not clear your history.");
  }
  revalidatePath("/research");
  return { ok: true, data: null };
}
