/** Evidence labels, in the order the UI lists them. Mirrors api/app/research/schemas.py. */
export const EVIDENCE_LABELS = [
  "systematic-review/meta-analysis",
  "randomized-trial",
  "review",
  "primary-study",
  "other",
] as const;

export type Evidence = (typeof EVIDENCE_LABELS)[number];

export const LITERATURE_SOURCES = ["europepmc", "pubmed"] as const;
export type LiteratureSource = (typeof LITERATURE_SOURCES)[number];

export const SOURCE_FILTERS = ["all", ...LITERATURE_SOURCES] as const;
export type SourceFilter = (typeof SOURCE_FILTERS)[number];

export const SOURCE_NAMES: Record<LiteratureSource, string> = {
  europepmc: "Europe PMC",
  pubmed: "PubMed",
};

/**
 * One publication as the web app handles it: every field present (null when unknown), whether it
 * came from the API or from the `literature_references` cache.
 */
export interface LiteratureReference {
  source: LiteratureSource;
  pmid: string | null;
  pmcid: string | null;
  doi: string | null;
  title: string;
  authors: string[];
  journal: string | null;
  year: number | null;
  abstract: string | null;
  publication_types: string[];
  url: string;
  evidence: Evidence;
}

export interface SavedState {
  id: string;
  note: string;
}

/** A reference plus its row in the shared cache (null if it could not be cached) and save state. */
export interface ReferenceView extends LiteratureReference {
  cacheId: string | null;
  saved: SavedState | null;
}

export type AnswerSection = "established" | "emerging" | "open-questions";

export interface CitedSentence {
  text: string;
  citations: number[];
  section: AnswerSection | null;
}

export interface CitedAnswer {
  question: string;
  sentences: CitedSentence[];
  sources: ReferenceView[];
  provider: "extractive" | "ollama";
  providerNote: string | null;
  removedUnsupported: number;
  failedSources: LiteratureSource[];
  disclaimer: string;
}

export interface SearchOutcome {
  references: ReferenceView[];
  failedSources: LiteratureSource[];
  /** Set when results could not be added to the shared cache, so saving is unavailable. */
  cacheWarning: string | null;
}
