import { z } from "zod";

import { SOURCE_FILTERS } from "./types";

/** Matches MAX_QUERY_LENGTH, MAX_SEARCH_LIMIT and MAX_ANSWER_SOURCES in the API. */
export const MAX_QUERY_LENGTH = 300;
export const MAX_SEARCH_LIMIT = 25;
export const MAX_ANSWER_SOURCES = 8;
export const MAX_NOTE_LENGTH = 2000;

/**
 * Collapses runs of whitespace (including newlines and tabs) to single spaces, trims, and drops
 * control characters, so equivalent queries are recorded and cached identically.
 */
export function normaliseQuery(raw: string): string {
  const withoutControls = Array.from(raw, (char) => {
    const code = char.charCodeAt(0);
    return code < 0x20 || code === 0x7f ? " " : char;
  }).join("");
  return withoutControls.replace(/\s+/g, " ").trim();
}

const queryText = (label: string) =>
  z
    .string()
    .transform(normaliseQuery)
    .pipe(
      z
        .string()
        .min(2, `${label} must be at least 2 characters.`)
        .max(MAX_QUERY_LENGTH, `${label} must be at most ${MAX_QUERY_LENGTH} characters.`),
    );

export const searchInputSchema = z.object({
  q: queryText("Search terms"),
  source: z.enum(SOURCE_FILTERS).default("all"),
  limit: z.coerce.number().int().min(1).max(MAX_SEARCH_LIMIT).default(10),
});
export type SearchInput = z.input<typeof searchInputSchema>;

export const answerInputSchema = z.object({
  question: queryText("The question"),
  maxSources: z.coerce.number().int().min(1).max(MAX_ANSWER_SOURCES).default(5),
});
export type AnswerInput = z.input<typeof answerInputSchema>;

export const libraryInputSchema = z.object({ q: queryText("Search terms") });

export const noteSchema = z
  .string()
  .transform((note) => note.replace(/\r\n/g, "\n").trim())
  .pipe(z.string().max(MAX_NOTE_LENGTH, `Notes can be at most ${MAX_NOTE_LENGTH} characters.`));

export const referenceIdSchema = z.uuid("Unknown reference.");

/** Mode of the research page, as used in the URL (`?mode=`) and the query history. */
export const RESEARCH_MODES = ["search", "answer", "library"] as const;
export type ResearchMode = (typeof RESEARCH_MODES)[number];

export function parseMode(value: unknown): ResearchMode {
  return RESEARCH_MODES.find((mode) => mode === value) ?? "search";
}
