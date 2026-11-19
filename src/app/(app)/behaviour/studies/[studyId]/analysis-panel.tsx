"use client";

import { useState, useTransition } from "react";

import type { Association } from "@/lib/api/client";
import { ASSOCIATIONS_NOTICE } from "@/lib/behaviour/analytics";
import { FIELD_LABELS } from "@/lib/behaviour/schemas";

import { type StudyAnalysis, runAnalysisAction } from "../../actions";
import { primaryButton } from "../../ui";

const fmt = (value: number | null | undefined, digits = 2) =>
  value === null || value === undefined ? "–" : value.toFixed(digits);

const fmtP = (value: number | null | undefined) => {
  if (value === null || value === undefined) {
    return "–";
  }
  return value < 0.001 ? "< 0.001" : value.toFixed(3);
};

/** A small interval plot: the estimate as a dot, the 95% CI as a line, zero marked. */
function IntervalPlot({ association }: { association: Association }) {
  const rho = association.statistic === "rho";
  const [min, max] = rho ? [-1, 1] : [0, 0.5];
  const x = (v: number) => ((Math.min(max, Math.max(min, v)) - min) / (max - min)) * 100;
  const { estimate, ci_low: low, ci_high: high } = association;
  if (estimate === null) {
    return null;
  }
  return (
    <svg
      viewBox="0 0 100 16"
      className="h-4 w-40"
      role="img"
      aria-label={`Estimate ${fmt(estimate)}, 95% interval ${fmt(low)} to ${fmt(high)}`}
    >
      <line x1="0" x2="100" y1="8" y2="8" stroke="#e2e6ec" strokeWidth="1" />
      <line x1={x(0)} x2={x(0)} y1="2" y2="14" stroke="#6b7789" strokeWidth="0.8" />
      {low !== null && high !== null && (
        <line x1={x(low)} x2={x(high)} y1="8" y2="8" stroke="#b45309" strokeWidth="2.5" />
      )}
      <circle cx={x(estimate)} cy="8" r="3" fill="#b45309" stroke="#ffffff" strokeWidth="1" />
    </svg>
  );
}

export function AnalysisPanel({ studyId, synthetic }: { studyId: string; synthetic: boolean }) {
  const [result, setResult] = useState<StudyAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = () => {
    setError(null);
    startTransition(async () => {
      const response = await runAnalysisAction(studyId);
      if (response.ok) {
        setResult(response.data);
      } else {
        setError(response.error);
      }
    });
  };

  const a = result?.associations;
  return (
    <section
      aria-labelledby="analysis-heading"
      className="space-y-4 rounded-2xl border border-line bg-card p-5"
      data-testid="analysis-panel"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="analysis-heading" className="text-lg font-semibold">
            Trigger analysis
          </h2>
          <p className="text-sm text-ink-soft">
            Spearman rank correlations with participant-level bootstrap 95% intervals, and a
            Kruskal–Wallis effect size for time of day. See the model card in
            docs/models/behaviour-associations.md.
          </p>
        </div>
        <button type="button" onClick={run} disabled={pending} className={primaryButton}>
          {pending ? "Analysing…" : result ? "Run again" : "Run association analysis"}
        </button>
      </div>

      <p
        role="note"
        className="rounded-lg border border-amber-200 bg-warn-soft px-4 py-3 text-sm leading-6 text-warn"
        data-testid="associations-notice"
      >
        {ASSOCIATIONS_NOTICE}
      </p>

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      {a && result && (
        <>
          <p className="text-xs text-muted">
            {result.rowsSent.toLocaleString("en-GB")} observations
            {a.n_participants !== null ? ` from ${a.n_participants} participants` : ""} ·{" "}
            {a.resamples} bootstrap resamples by {a.bootstrap_unit} (seed {a.seed}) · results need n
            ≥ {a.min_n}
            {a.synthetic || synthetic ? " · SYNTHETIC DATA" : ""}
            {result.truncated ? " · most recent rows only" : ""}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" data-testid="associations-table">
              <thead className="border-b border-line text-xs text-muted">
                <tr>
                  <th className="py-2 pr-4 font-medium">Pair</th>
                  <th className="py-2 pr-4 font-medium">Estimate [95% CI]</th>
                  <th className="py-2 pr-4 font-medium">Interval</th>
                  <th className="py-2 pr-4 font-medium">n</th>
                  <th className="py-2 pr-4 font-medium">p (Holm)</th>
                  <th className="py-2 font-medium">Reading</th>
                </tr>
              </thead>
              <tbody>
                {a.associations.map((pair) => (
                  <tr key={pair.pair} className="border-b border-line align-top last:border-0">
                    <td className="py-3 pr-4 font-medium">{pair.label}</td>
                    <td className="whitespace-nowrap py-3 pr-4 tabular-nums">
                      {pair.sufficient ? (
                        <>
                          {pair.statistic === "rho" ? "ρ" : "ε²"} = {fmt(pair.estimate)}{" "}
                          <span className="text-muted">
                            [{fmt(pair.ci_low)}, {fmt(pair.ci_high)}]
                          </span>
                        </>
                      ) : (
                        <span className="text-muted">insufficient data</span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <IntervalPlot association={pair} />
                    </td>
                    <td className="py-3 pr-4 tabular-nums">{pair.n}</td>
                    <td className="py-3 pr-4 tabular-nums">{fmtP(pair.p_value_holm)}</td>
                    <td className="py-3 text-ink-soft">
                      {pair.interpretation}
                      {pair.groups && pair.sufficient && (
                        <span className="mt-1 block text-xs text-muted">
                          Mean craving:{" "}
                          {pair.groups
                            .map((g) => `${g.bucket} ${g.hours} ${fmt(g.mean, 1)} (n ${g.n})`)
                            .join(" · ")}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs leading-5 text-muted">
            Strength words follow common rules of thumb (|ρ| &lt; 0.1 negligible, &lt; 0.3 weak,
            &lt; 0.5 moderate, otherwise strong). They describe size, not importance. When an
            interval includes zero, even the direction of the association is uncertain.
          </p>

          <details>
            <summary className="cursor-pointer text-sm font-medium">Descriptive statistics</summary>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-left text-sm tabular-nums">
                <thead className="text-xs text-muted">
                  <tr>
                    {[
                      "Field",
                      "n",
                      "Missing",
                      "Mean",
                      "SD",
                      "Min",
                      "Q1",
                      "Median",
                      "Q3",
                      "Max",
                    ].map((h) => (
                      <th key={h} className="py-1 pr-3 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.summary.fields.map((f) => (
                    <tr key={f.field} className="border-t border-line">
                      <td className="py-1 pr-3">{FIELD_LABELS[f.field].label}</td>
                      <td className="py-1 pr-3">{f.n}</td>
                      <td className="py-1 pr-3">{Math.round(f.missing_fraction * 100)}%</td>
                      <td className="py-1 pr-3">{fmt(f.mean)}</td>
                      <td className="py-1 pr-3">{fmt(f.sd)}</td>
                      <td className="py-1 pr-3">{fmt(f.min, 0)}</td>
                      <td className="py-1 pr-3">{fmt(f.q1, 1)}</td>
                      <td className="py-1 pr-3">{fmt(f.median, 1)}</td>
                      <td className="py-1 pr-3">{fmt(f.q3, 1)}</td>
                      <td className="py-1 pr-3">{fmt(f.max, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
