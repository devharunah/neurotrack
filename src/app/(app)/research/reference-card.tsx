"use client";

import { useId, useState, useTransition } from "react";

import { MAX_NOTE_LENGTH } from "@/lib/research/query";
import { formatAuthors, referenceLinks } from "@/lib/research/references";
import { type ReferenceView, SOURCE_NAMES, type SavedState } from "@/lib/research/types";

import { saveReferenceAction, unsaveReferenceAction } from "./actions";
import { EvidenceBadge, inputClass, linkClass, secondaryButton } from "./ui";

interface ReferenceCardProps {
  reference: ReferenceView;
  /** 1-based position in an answer's source list; shown as [n] and used as the anchor. */
  index?: number;
  anchorId?: string;
  highlighted?: boolean;
  /** Extra line under the metadata, e.g. when it was saved. */
  footnote?: string;
  /** Called after the user unsaves it (the saved page removes the card). */
  onUnsaved?: () => void;
}

export function ReferenceCard({
  reference,
  index,
  anchorId,
  highlighted = false,
  footnote,
  onUnsaved,
}: ReferenceCardProps) {
  const links = referenceLinks(reference);
  const titleId = useId();

  return (
    <article
      id={anchorId}
      tabIndex={anchorId ? -1 : undefined}
      aria-labelledby={titleId}
      className={`scroll-mt-24 rounded-2xl border bg-card p-5 transition-shadow ${
        highlighted ? "border-accent ring-2 ring-accent/40" : "border-line"
      }`}
      data-testid="reference-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 id={titleId} className="min-w-0 flex-1 font-semibold leading-6">
          {index !== undefined && <span className="mr-2 font-mono text-accent">[{index}]</span>}
          {reference.title}
        </h3>
        <EvidenceBadge evidence={reference.evidence} />
      </div>
      <p className="mt-1 text-sm text-ink-soft">{formatAuthors(reference.authors)}</p>
      <p className="mt-0.5 text-sm text-muted">
        {[reference.journal, reference.year].filter((part) => part != null).join(" · ") ||
          "Journal not listed"}
        <span className="ml-2 text-xs">via {SOURCE_NAMES[reference.source]}</span>
      </p>
      {footnote && <p className="mt-0.5 text-xs text-muted">{footnote}</p>}

      {reference.abstract ? (
        <details className="group mt-3 text-sm">
          <summary className="cursor-pointer font-medium text-ink-soft hover:text-ink">
            Abstract
          </summary>
          <p className="mt-2 whitespace-pre-line leading-6 text-ink-soft">{reference.abstract}</p>
        </details>
      ) : (
        <p className="mt-3 text-sm text-muted">No abstract available.</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {links.doi && (
          <a href={links.doi} target="_blank" rel="noopener noreferrer" className={linkClass}>
            DOI<span className="sr-only"> (opens in a new tab)</span>
          </a>
        )}
        {links.pubmed && (
          <a href={links.pubmed} target="_blank" rel="noopener noreferrer" className={linkClass}>
            PubMed<span className="sr-only"> (opens in a new tab)</span>
          </a>
        )}
        <a href={links.europepmc} target="_blank" rel="noopener noreferrer" className={linkClass}>
          Europe PMC<span className="sr-only"> (opens in a new tab)</span>
        </a>
        <span className="ml-auto">
          <SaveControl reference={reference} {...(onUnsaved ? { onUnsaved } : {})} />
        </span>
      </div>
    </article>
  );
}

function SaveControl({
  reference,
  onUnsaved,
}: {
  reference: ReferenceView;
  onUnsaved?: () => void;
}) {
  const [saved, setSaved] = useState<SavedState | null>(reference.saved);
  const [note, setNote] = useState(reference.saved?.note ?? "");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const noteId = useId();

  if (!reference.cacheId) {
    return (
      <span className="text-xs text-muted" title="Only records with a PMID or DOI can be saved.">
        Saving unavailable
      </span>
    );
  }
  const referenceId = reference.cacheId;

  const save = (text: string) => {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await saveReferenceAction(referenceId, text);
      if (result.ok) {
        setSaved(result.data);
        setNote(result.data.note);
        setEditing(false);
        setMessage(saved ? "Note saved." : "Saved to your library.");
      } else {
        setError(result.error);
      }
    });
  };

  const unsave = () => {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await unsaveReferenceAction(referenceId);
      if (result.ok) {
        setSaved(null);
        setNote("");
        setEditing(false);
        setMessage("Removed from your library.");
        onUnsaved?.();
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <span className="flex flex-col items-end gap-2">
      <span className="flex flex-wrap items-center justify-end gap-2">
        {saved ? (
          <>
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
              Saved
            </span>
            <button
              type="button"
              className={secondaryButton}
              onClick={() => setEditing((value) => !value)}
              aria-expanded={editing}
              aria-controls={noteId}
              disabled={pending}
            >
              {saved.note ? "Edit note" : "Add note"}
            </button>
            <button type="button" className={secondaryButton} onClick={unsave} disabled={pending}>
              {pending ? "Working…" : "Unsave"}
            </button>
          </>
        ) : (
          <button
            type="button"
            className={secondaryButton}
            onClick={() => save("")}
            disabled={pending}
          >
            {pending ? "Saving…" : "Save"}
          </button>
        )}
      </span>
      {saved?.note && !editing && (
        <span className="max-w-md text-right text-xs leading-5 whitespace-pre-line text-ink-soft">
          Note: {saved.note}
        </span>
      )}
      {saved && editing && (
        <span id={noteId} className="flex w-full min-w-64 max-w-md flex-col items-end gap-2">
          <label className="w-full text-xs text-ink-soft">
            Your note (private)
            <textarea
              className={`${inputClass} mt-1 min-h-20`}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={MAX_NOTE_LENGTH}
            />
          </label>
          <button
            type="button"
            className={secondaryButton}
            onClick={() => save(note)}
            disabled={pending}
          >
            {pending ? "Saving…" : "Save note"}
          </button>
        </span>
      )}
      <span aria-live="polite" className="text-xs text-muted">
        {message}
      </span>
      {error && (
        <span role="alert" className="text-xs text-red-700">
          {error}
        </span>
      )}
    </span>
  );
}
