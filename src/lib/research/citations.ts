import type { AnswerSection, CitedSentence } from "./types";

/** DOM id of the n-th source (1-based) in an answer, the target of its `[n]` markers. */
export function sourceAnchorId(index: number): string {
  return `source-${index}`;
}

export interface CitationMarker {
  index: number;
  label: string;
  href: string;
}

/**
 * The clickable `[n]` markers for one sentence: deduplicated, in citation order, and limited to
 * indices that point at a listed source. The API already guarantees this; checking again here
 * means a marker can never link to nothing, whatever reaches the browser.
 */
export function citationMarkers(
  citations: readonly number[],
  sourceCount: number,
): CitationMarker[] {
  const seen = new Set<number>();
  const markers: CitationMarker[] = [];
  for (const index of citations) {
    if (!Number.isInteger(index) || index < 1 || index > sourceCount || seen.has(index)) {
      continue;
    }
    seen.add(index);
    markers.push({ index, label: `[${index}]`, href: `#${sourceAnchorId(index)}` });
  }
  return markers;
}

export type MarkedSegment = { kind: "text"; text: string } | { kind: "citation"; index: number };

/**
 * Splits text containing inline markers such as "finding [1][2] and [3, 4]" into text and
 * citation segments, so markers can be rendered as links. Markers that cite an index outside
 * `1..sourceCount` are left as plain text rather than turned into dead links.
 */
export function parseMarkedText(text: string, sourceCount: number): MarkedSegment[] {
  const segments: MarkedSegment[] = [];
  const pattern = /\[(\d+(?:\s*,\s*\d+)*)\]/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const indices = (match[1] ?? "").split(",").map((part) => Number(part.trim()));
    if (indices.some((index) => index < 1 || index > sourceCount)) {
      continue;
    }
    const start = match.index;
    if (start > last) {
      segments.push({ kind: "text", text: text.slice(last, start) });
    }
    for (const index of indices) {
      segments.push({ kind: "citation", index });
    }
    last = start + match[0].length;
  }
  if (last < text.length) {
    segments.push({ kind: "text", text: text.slice(last) });
  }
  return segments;
}

export const SECTION_TITLES: Record<AnswerSection, string> = {
  established: "Established findings",
  emerging: "Emerging evidence",
  "open-questions": "Open questions",
};

export interface SentenceGroup {
  section: AnswerSection | null;
  title: string | null;
  sentences: CitedSentence[];
}

/**
 * Groups consecutive sentences by section, keeping the order the provider used. Extractive
 * answers have no sections and come back as one untitled group.
 */
export function groupBySection(sentences: readonly CitedSentence[]): SentenceGroup[] {
  const groups: SentenceGroup[] = [];
  for (const sentence of sentences) {
    const current = groups.at(-1);
    if (current && current.section === sentence.section) {
      current.sentences.push(sentence);
    } else {
      groups.push({
        section: sentence.section,
        title: sentence.section ? SECTION_TITLES[sentence.section] : null,
        sentences: [sentence],
      });
    }
  }
  return groups;
}

/** Indices (1-based) of the sources that at least one kept sentence cites. */
export function citedSourceIndices(sentences: readonly CitedSentence[]): Set<number> {
  return new Set(sentences.flatMap((sentence) => sentence.citations));
}
