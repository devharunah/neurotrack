import {
  EVIDENCE_LABELS,
  type Evidence,
  LITERATURE_SOURCES,
  type LiteratureReference,
  type LiteratureSource,
} from "./types";

/** Loose shape of a reference from the API (optional fields) or the cache (nullable columns). */
export interface ReferenceLike {
  source: string;
  pmid?: string | null | undefined;
  pmcid?: string | null | undefined;
  doi?: string | null | undefined;
  title: string;
  authors?: readonly string[] | null | undefined;
  journal?: string | null | undefined;
  year?: number | null | undefined;
  abstract?: string | null | undefined;
  publication_types?: readonly string[] | null | undefined;
  url: string;
  evidence?: string | null | undefined;
}

function isSource(value: string): value is LiteratureSource {
  return (LITERATURE_SOURCES as readonly string[]).includes(value);
}

function isEvidence(value: string | null | undefined): value is Evidence {
  return value != null && (EVIDENCE_LABELS as readonly string[]).includes(value);
}

/** Fills every optional field so components and the cache see one shape. */
export function toLiteratureReference(raw: ReferenceLike): LiteratureReference {
  return {
    source: isSource(raw.source) ? raw.source : "europepmc",
    pmid: raw.pmid ?? null,
    pmcid: raw.pmcid ?? null,
    doi: raw.doi ?? null,
    title: raw.title,
    authors: [...(raw.authors ?? [])],
    journal: raw.journal ?? null,
    year: raw.year ?? null,
    abstract: raw.abstract ?? null,
    publication_types: [...(raw.publication_types ?? [])],
    url: raw.url,
    evidence: isEvidence(raw.evidence) ? raw.evidence : "other",
  };
}

/** Row for `cache_literature_references`, or null if it cannot satisfy the table's CHECKs. */
export type CacheRow = LiteratureReference;

const LIMITS = { title: 2000, journal: 500, abstract: 50_000, url: 500, doi: 300 } as const;

function clip(value: string | null, max: number): string | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Sanitises a reference against the CHECK constraints of `literature_references`, so one odd
 * record cannot make the whole cache insert fail. Identifiers that do not match their format are
 * dropped; a record left with neither a PMID nor a DOI is not cacheable and returns null.
 */
export function toCacheRow(reference: LiteratureReference): CacheRow | null {
  const pmid = reference.pmid && /^\d{1,10}$/.test(reference.pmid) ? reference.pmid : null;
  const pmcid = reference.pmcid && /^PMC\d{1,12}$/.test(reference.pmcid) ? reference.pmcid : null;
  const rawDoi = reference.doi?.trim().toLowerCase() ?? null;
  const doi =
    rawDoi && rawDoi.length <= LIMITS.doi && /^10\.\d{4,9}\/\S+$/.test(rawDoi) ? rawDoi : null;
  const title = clip(reference.title, LIMITS.title);
  const url = reference.url.trim();
  if ((!pmid && !doi) || !title || !url.startsWith("https://") || url.length > LIMITS.url) {
    return null;
  }
  const { year: rawYear } = reference;
  const year =
    rawYear != null && Number.isInteger(rawYear) && rawYear >= 1800 && rawYear <= 2100
      ? rawYear
      : null;
  return {
    ...reference,
    pmid,
    pmcid,
    doi,
    title,
    authors: reference.authors.slice(0, 5000),
    journal: clip(reference.journal, LIMITS.journal),
    year,
    abstract: clip(reference.abstract, LIMITS.abstract),
    publication_types: reference.publication_types.slice(0, 50),
    url,
  };
}

/** Key used to match a reference with its cached row: PMID first, then DOI. */
export function identityKeys(reference: Pick<LiteratureReference, "pmid" | "doi">): string[] {
  const keys: string[] = [];
  if (reference.pmid) {
    keys.push(`pmid:${reference.pmid}`);
  }
  if (reference.doi) {
    keys.push(`doi:${reference.doi.toLowerCase()}`);
  }
  return keys;
}

export interface ReferenceLinks {
  doi: string | null;
  pubmed: string | null;
  europepmc: string;
}

/** Links to the original record: the DOI resolver, PubMed and Europe PMC. */
export function referenceLinks(
  reference: Pick<LiteratureReference, "source" | "pmid" | "pmcid" | "doi" | "url">,
): ReferenceLinks {
  const doi = reference.doi ? `https://doi.org/${encodeDoi(reference.doi)}` : null;
  const pubmed = reference.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${reference.pmid}/` : null;
  let europepmc: string;
  if (reference.source === "europepmc" && reference.url.startsWith("https://europepmc.org/")) {
    europepmc = reference.url;
  } else if (reference.pmid) {
    europepmc = `https://europepmc.org/article/MED/${reference.pmid}`;
  } else if (reference.pmcid) {
    europepmc = `https://europepmc.org/article/PMC/${reference.pmcid}`;
  } else if (reference.doi) {
    europepmc = `https://europepmc.org/search?query=${encodeURIComponent(`DOI:"${reference.doi}"`)}`;
  } else {
    europepmc = reference.url;
  }
  return { doi, pubmed, europepmc };
}

/** Encodes a DOI for a doi.org URL while keeping its `/` separators readable. */
export function encodeDoi(doi: string): string {
  return doi.split("/").map(encodeURIComponent).join("/");
}

/** "Schultz W, Dayan P, Montague PR" or "Schultz W, Dayan P, Montague PR, et al." */
export function formatAuthors(authors: readonly string[], max = 3): string {
  if (authors.length === 0) {
    return "Authors not listed";
  }
  const shown = authors.slice(0, max).join(", ");
  return authors.length > max ? `${shown}, et al.` : shown;
}
