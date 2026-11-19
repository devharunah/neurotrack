"use client";

import { useEffect, useRef, useState } from "react";

import {
  citationMarkers,
  citedSourceIndices,
  groupBySection,
  sourceAnchorId,
} from "@/lib/research/citations";
import { type CitedAnswer, SOURCE_NAMES } from "@/lib/research/types";

import { ReferenceCard } from "./reference-card";
import { EmptyState, WarningNote } from "./ui";

const PROVIDER_LABELS: Record<CitedAnswer["provider"], string> = {
  extractive: "Extractive (no AI model): sentences quoted from the abstracts",
  ollama: "Local language model (Ollama), citations checked by the server",
};

export function AnswerView({ answer }: { answer: CitedAnswer }) {
  const [highlighted, setHighlighted] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const groups = groupBySection(answer.sentences);
  const cited = citedSourceIndices(answer.sentences);
  const sourceCount = answer.sources.length;

  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    },
    [],
  );

  const jumpTo = (event: React.MouseEvent<HTMLAnchorElement>, index: number) => {
    const target = document.getElementById(sourceAnchorId(index));
    if (!target) {
      return;
    }
    event.preventDefault();
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    target.focus({ preventScroll: true });
    window.history.replaceState(null, "", `#${sourceAnchorId(index)}`);
    setHighlighted(index);
    if (timer.current) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(() => setHighlighted(null), 2500);
  };

  return (
    <div className="space-y-6" data-testid="answer">
      <section
        aria-labelledby="answer-heading"
        className="rounded-2xl border border-line bg-card p-5"
      >
        <h2 id="answer-heading" className="text-lg font-semibold">
          Answer
        </h2>
        <p className="mt-1 text-sm text-muted">{answer.question}</p>

        {answer.sentences.length === 0 ? (
          <div className="mt-4">
            <EmptyState>
              No sentence in the retrieved abstracts could be cited for this question, so there is
              no answer to show. {answer.providerNote}{" "}
              {sourceCount > 0
                ? "The sources that were retrieved are listed below."
                : "Try rephrasing with more specific scientific terms."}
            </EmptyState>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {groups.map((group, groupIndex) => (
              <div key={`${group.section ?? "none"}-${groupIndex}`}>
                {group.title && (
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">
                    {group.title}
                  </h3>
                )}
                <ul className="mt-2 space-y-2 leading-7">
                  {group.sentences.map((sentence) => (
                    <li
                      key={`${sentence.text} ${sentence.citations.join(",")}`}
                      data-testid="answer-sentence"
                    >
                      {sentence.text}{" "}
                      {citationMarkers(sentence.citations, sourceCount).map((marker) => (
                        <a
                          key={marker.index}
                          href={marker.href}
                          onClick={(event) => jumpTo(event, marker.index)}
                          className="ml-0.5 rounded px-0.5 font-mono text-sm font-semibold text-accent hover:bg-accent-soft"
                          aria-label={`Source ${marker.index}`}
                          data-testid="citation-marker"
                        >
                          {marker.label}
                        </a>
                      ))}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        <dl className="mt-5 grid gap-x-6 gap-y-2 border-t border-line pt-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Provider</dt>
            <dd data-testid="answer-provider">{PROVIDER_LABELS[answer.provider]}</dd>
          </div>
          <div>
            <dt className="text-muted">Unsupported sentences removed</dt>
            <dd data-testid="removed-unsupported">
              {answer.removedUnsupported === 0
                ? "None"
                : `${answer.removedUnsupported} (cited nothing, or cited a source that was not retrieved)`}
            </dd>
          </div>
        </dl>
        {answer.providerNote && answer.sentences.length > 0 && (
          <p className="mt-2 text-sm text-ink-soft">{answer.providerNote}</p>
        )}
      </section>

      {answer.failedSources.length > 0 && (
        <WarningNote>
          {answer.failedSources.map((s) => SOURCE_NAMES[s]).join(" and ")} did not answer, so the
          sources below come from the other database only.
        </WarningNote>
      )}

      <p
        role="note"
        className="rounded-lg border border-amber-200 bg-warn-soft px-4 py-3 text-sm leading-6 text-warn"
        data-testid="answer-disclaimer"
      >
        {answer.disclaimer}
      </p>

      {sourceCount > 0 && (
        <section aria-labelledby="sources-heading">
          <h2 id="sources-heading" className="text-lg font-semibold">
            Sources
          </h2>
          <p className="mt-1 text-sm text-muted">
            The {sourceCount} retrieved {sourceCount === 1 ? "record" : "records"} the answer could
            cite.{" "}
            {cited.size < sourceCount && answer.sentences.length > 0
              ? "Some were retrieved but not cited."
              : ""}
          </p>
          <ol className="mt-3 space-y-3">
            {answer.sources.map((source, i) => (
              <li key={source.cacheId ?? source.url}>
                <ReferenceCard
                  reference={source}
                  index={i + 1}
                  anchorId={sourceAnchorId(i + 1)}
                  highlighted={highlighted === i + 1}
                />
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
