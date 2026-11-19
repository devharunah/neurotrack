"use client";

import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useId, useRef, useState, useTransition } from "react";

import {
  MAX_ANSWER_SOURCES,
  MAX_QUERY_LENGTH,
  type ResearchMode,
  normaliseQuery,
} from "@/lib/research/query";
import {
  type CitedAnswer,
  type ReferenceView,
  SOURCE_FILTERS,
  SOURCE_NAMES,
  type SearchOutcome,
  type SourceFilter,
} from "@/lib/research/types";

import {
  askQuestionAction,
  clearHistoryAction,
  searchLibraryAction,
  searchLiteratureAction,
} from "./actions";
import { AnswerView } from "./answer-view";
import { ReferenceCard } from "./reference-card";
import {
  EmptyState,
  ErrorNote,
  ResultSkeleton,
  WarningNote,
  inputClass,
  primaryButton,
  secondaryButton,
} from "./ui";

const MODES: { id: ResearchMode; label: string; hint: string }[] = [
  {
    id: "search",
    label: "Search literature",
    hint: "Search Europe PMC and PubMed. Results are added to the shared library cache.",
  },
  {
    id: "answer",
    label: "Ask a question",
    hint: "Get a short answer built only from retrieved abstracts, with every sentence cited.",
  },
  {
    id: "library",
    label: "Search my library",
    hint: "Full-text search over every reference already cached by NeuroTrack users.",
  },
];

const FILTER_LABELS: Record<SourceFilter, string> = {
  all: "Both sources",
  europepmc: SOURCE_NAMES.europepmc,
  pubmed: SOURCE_NAMES.pubmed,
};

type Outcome =
  | { mode: "search"; query: string; data: SearchOutcome }
  | { mode: "answer"; query: string; data: CitedAnswer }
  | { mode: "library"; query: string; data: ReferenceView[] };

const PLACEHOLDERS: Record<ResearchMode, string> = {
  search: "e.g. dopamine reward prediction error",
  answer: "e.g. How do dopamine neurons signal reward prediction errors?",
  library: "e.g. nucleus accumbens craving",
};

const PENDING_MESSAGES: Record<ResearchMode, string> = {
  search: "Searching Europe PMC and PubMed…",
  answer: "Retrieving abstracts and checking every citation…",
  library: "Searching your library…",
};

export interface HistoryEntry {
  id: string;
  query: string;
  mode: ResearchMode;
}

export function ResearchWorkbench({
  initialMode,
  initialQuery,
  history,
}: {
  initialMode: ResearchMode;
  initialQuery: string;
  history: HistoryEntry[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<ResearchMode>(initialMode);
  const [query, setQuery] = useState(initialQuery);
  const [source, setSource] = useState<SourceFilter>("all");
  const [maxSources, setMaxSources] = useState(5);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState<{ message: string; mode: ResearchMode } | null>(null);
  const [pending, startTransition] = useTransition();
  const ranInitial = useRef(false);
  const tabsId = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const run = (runMode: ResearchMode, rawQuery: string) => {
    const text = normaliseQuery(rawQuery);
    if (text.length < 2) {
      setError({ message: "Enter at least 2 characters.", mode: runMode });
      return;
    }
    setError(null);
    startTransition(async () => {
      if (runMode === "search") {
        const result = await searchLiteratureAction({ q: text, source, limit: 10 });
        if (result.ok) {
          setOutcome({ mode: "search", query: text, data: result.data });
        } else {
          setError({ message: result.error, mode: runMode });
        }
      } else if (runMode === "answer") {
        const result = await askQuestionAction({ question: text, maxSources });
        if (result.ok) {
          setOutcome({ mode: "answer", query: text, data: result.data });
        } else {
          setError({ message: result.error, mode: runMode });
        }
      } else {
        const result = await searchLibraryAction({ q: text });
        if (result.ok) {
          setOutcome({ mode: "library", query: text, data: result.data });
        } else {
          setError({ message: result.error, mode: runMode });
        }
      }
      // Keep the URL shareable, and refresh the server-rendered history now that the action has
      // recorded this query, without scrolling the page.
      const params = new URLSearchParams({ mode: runMode, q: text });
      router.replace(`/research?${params.toString()}`, { scroll: false });
    });
  };

  // A shared link such as /research?mode=answer&q=… runs once on arrival. Later URL changes
  // come from this component itself, so they must not trigger another run.
  const runInitial = useEffectEvent(() => {
    if (!ranInitial.current && initialQuery.trim().length >= 2) {
      ranInitial.current = true;
      run(initialMode, initialQuery);
    }
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: an Effect Event is never a dependency.
  useEffect(() => {
    runInitial();
  }, []);

  const selectMode = (next: ResearchMode) => {
    setMode(next);
    setError(null);
  };

  const onTabKey = (event: React.KeyboardEvent, index: number) => {
    const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (delta === 0) {
      return;
    }
    event.preventDefault();
    const nextIndex = (index + delta + MODES.length) % MODES.length;
    const next = MODES[nextIndex];
    if (next) {
      selectMode(next.id);
      tabRefs.current[nextIndex]?.focus();
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    run(mode, query);
  };

  const rerun = (entry: HistoryEntry) => {
    setMode(entry.mode);
    setQuery(entry.query);
    run(entry.mode, entry.query);
  };

  const [clearing, startClearing] = useTransition();
  const [historyError, setHistoryError] = useState<string | null>(null);
  const clearHistory = () => {
    setHistoryError(null);
    startClearing(async () => {
      const result = await clearHistoryAction();
      if (result.ok) {
        router.refresh();
      } else {
        setHistoryError(result.error);
      }
    });
  };

  const current = MODES.find((m) => m.id === mode) ?? MODES[0];
  const visibleOutcome = outcome?.mode === mode ? outcome : null;
  const visibleError = error?.mode === mode ? error.message : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div className="min-w-0 space-y-6">
        <div className="rounded-2xl border border-line bg-card p-5">
          <div role="tablist" aria-label="Research tools" className="flex flex-wrap gap-2">
            {MODES.map((m, index) => (
              <button
                key={m.id}
                ref={(element) => {
                  tabRefs.current[index] = element;
                }}
                type="button"
                role="tab"
                id={`${tabsId}-${m.id}-tab`}
                aria-selected={mode === m.id}
                aria-controls={`${tabsId}-panel`}
                tabIndex={mode === m.id ? 0 : -1}
                onClick={() => selectMode(m.id)}
                onKeyDown={(event) => onTabKey(event, index)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                  mode === m.id ? "bg-accent text-white" : "text-ink-soft hover:bg-paper"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <form
            id={`${tabsId}-panel`}
            role="tabpanel"
            aria-labelledby={`${tabsId}-${mode}-tab`}
            onSubmit={submit}
            className="mt-4 space-y-3"
          >
            <p className="text-sm text-ink-soft">{current?.hint}</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="min-w-0 flex-1">
                <span className="sr-only">
                  {mode === "answer" ? "Your question" : "Search terms"}
                </span>
                <input
                  type="search"
                  name="q"
                  className={inputClass}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={PLACEHOLDERS[mode]}
                  maxLength={MAX_QUERY_LENGTH}
                  autoComplete="off"
                  required
                  minLength={2}
                />
              </label>
              <button type="submit" disabled={pending} className={primaryButton}>
                {pending ? "Working…" : mode === "answer" ? "Ask" : "Search"}
              </button>
            </div>

            {mode === "search" && (
              <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                <legend className="sr-only">Source</legend>
                <span className="text-muted" aria-hidden="true">
                  Source:
                </span>
                {SOURCE_FILTERS.map((filter) => (
                  <label key={filter} className="inline-flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="source"
                      value={filter}
                      checked={source === filter}
                      onChange={() => setSource(filter)}
                      className="accent-accent"
                    />
                    {FILTER_LABELS[filter]}
                  </label>
                ))}
              </fieldset>
            )}
            {mode === "answer" && (
              <label className="flex items-center gap-2 text-sm">
                <span className="text-muted">Sources to use</span>
                <select
                  value={maxSources}
                  onChange={(event) => setMaxSources(Number(event.target.value))}
                  className="rounded-lg border border-line bg-white px-2 py-1 text-sm"
                >
                  {Array.from({ length: MAX_ANSWER_SOURCES }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </form>
        </div>

        <div aria-live="polite" aria-busy={pending} className="sr-only">
          {pending ? PENDING_MESSAGES[mode] : ""}
        </div>

        {pending ? (
          <div className="space-y-3">
            <p className="text-sm text-muted">{PENDING_MESSAGES[mode]}</p>
            <ResultSkeleton />
          </div>
        ) : visibleError ? (
          <ErrorNote>
            <p>{visibleError}</p>
            <button
              type="button"
              className={`${secondaryButton} mt-2`}
              onClick={() => run(mode, query)}
            >
              Try again
            </button>
          </ErrorNote>
        ) : visibleOutcome ? (
          <Results outcome={visibleOutcome} />
        ) : null}
      </div>

      <aside aria-labelledby="history-heading" className="space-y-2 lg:pt-1">
        <h2 id="history-heading" className="text-sm font-semibold text-ink-soft">
          Your recent queries
        </h2>
        {history.length === 0 ? (
          <p className="text-sm text-muted">
            Nothing yet. Your searches are listed here, visible only to you.
          </p>
        ) : (
          <>
            <ul className="space-y-1" data-testid="query-history">
              {history.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => rerun(entry)}
                    disabled={pending}
                    className="w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-card disabled:opacity-60"
                  >
                    <span className="block truncate">{entry.query}</span>
                    <span className="text-xs text-muted">{MODE_LABELS[entry.mode]}</span>
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={clearHistory}
              disabled={clearing}
              className="text-xs text-muted underline-offset-2 hover:underline disabled:opacity-60"
            >
              {clearing ? "Clearing…" : "Clear history"}
            </button>
            {historyError && (
              <p role="alert" className="text-xs text-red-700">
                {historyError}
              </p>
            )}
          </>
        )}
      </aside>
    </div>
  );
}

const MODE_LABELS: Record<ResearchMode, string> = {
  search: "Literature search",
  answer: "Question",
  library: "Library search",
};

function Results({ outcome }: { outcome: Outcome }) {
  if (outcome.mode === "answer") {
    return <AnswerView answer={outcome.data} />;
  }
  if (outcome.mode === "library") {
    const references = outcome.data;
    return (
      <section aria-labelledby="results-heading" className="space-y-3">
        <h2 id="results-heading" className="text-lg font-semibold">
          {references.length} {references.length === 1 ? "match" : "matches"} in the library for “
          {outcome.query}”
        </h2>
        {references.length === 0 ? (
          <EmptyState>
            Nothing in the library matches. The library only holds references that someone has
            already found through a literature search, so try “Search literature” first. You can use
            quotes for phrases, <code>or</code> between alternatives and <code>-word</code> to
            exclude a word.
          </EmptyState>
        ) : (
          <ReferenceList references={references} />
        )}
      </section>
    );
  }
  const { references, failedSources, cacheWarning } = outcome.data;
  return (
    <section aria-labelledby="results-heading" className="space-y-3">
      <h2 id="results-heading" className="text-lg font-semibold">
        {references.length} {references.length === 1 ? "result" : "results"} for “{outcome.query}”
      </h2>
      {failedSources.length > 0 && (
        <WarningNote>
          {failedSources.map((s) => SOURCE_NAMES[s]).join(" and ")} did not answer in time, so these
          results come from the other database only. Try again later for complete results.
        </WarningNote>
      )}
      {cacheWarning && <WarningNote>{cacheWarning}</WarningNote>}
      {references.length === 0 ? (
        <EmptyState>
          No publications matched. Try fewer or broader terms, check the spelling, or switch the
          source to both databases.
        </EmptyState>
      ) : (
        <ReferenceList references={references} />
      )}
    </section>
  );
}

function ReferenceList({ references }: { references: ReferenceView[] }) {
  return (
    <ul className="space-y-3" data-testid="results">
      {references.map((reference) => (
        <li key={reference.cacheId ?? reference.url}>
          <ReferenceCard reference={reference} />
        </li>
      ))}
    </ul>
  );
}
