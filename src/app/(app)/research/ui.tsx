import { EVIDENCE_INFO, EVIDENCE_NOT_QUALITY } from "@/lib/research/evidence";
import { EVIDENCE_LABELS, type Evidence } from "@/lib/research/types";

const EVIDENCE_STYLES: Record<Evidence, string> = {
  "systematic-review/meta-analysis": "border-indigo-200 bg-indigo-50 text-indigo-800",
  "randomized-trial": "border-sky-200 bg-sky-50 text-sky-800",
  review: "border-teal-200 bg-teal-50 text-teal-800",
  "primary-study": "border-slate-200 bg-slate-50 text-slate-700",
  other: "border-line bg-paper text-muted",
};

/** The type of evidence a record reports. Deliberately neutral colours: it is not a grade. */
export function EvidenceBadge({ evidence }: { evidence: Evidence }) {
  const info = EVIDENCE_INFO[evidence];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${EVIDENCE_STYLES[evidence]}`}
      title={`Evidence type: ${info.label}. ${info.description} This is the type of evidence, not a quality grade.`}
      data-testid="evidence-badge"
    >
      <span className="sr-only">Evidence type: </span>
      {info.label}
    </span>
  );
}

export function EvidenceLegend() {
  return (
    <details
      className="rounded-2xl border border-line bg-card p-4 text-sm"
      data-testid="evidence-legend"
    >
      <summary className="cursor-pointer font-medium">What do the evidence labels mean?</summary>
      <p className="mt-3 leading-6 text-ink-soft">{EVIDENCE_NOT_QUALITY}</p>
      <dl className="mt-3 space-y-2">
        {EVIDENCE_LABELS.map((label) => (
          <div key={label} className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
            <dt className="shrink-0 sm:w-56">
              <EvidenceBadge evidence={label} />
            </dt>
            <dd className="leading-6 text-ink-soft">{EVIDENCE_INFO[label].description}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800"
    >
      {children}
    </div>
  );
}

export function WarningNote({ children }: { children: React.ReactNode }) {
  return (
    <output className="block rounded-lg border border-amber-200 bg-warn-soft px-4 py-3 text-sm leading-6 text-warn">
      {children}
    </output>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line p-6 text-sm leading-6 text-ink-soft">
      {children}
    </div>
  );
}

/** Placeholder cards while a search runs. */
const SKELETON_KEYS = ["first", "second", "third"] as const;

export function ResultSkeleton() {
  return (
    <ul className="space-y-3" aria-hidden="true">
      {SKELETON_KEYS.map((key) => (
        <li key={key} className="animate-pulse rounded-2xl border border-line bg-card p-5">
          <div className="h-4 w-3/4 rounded bg-line" />
          <div className="mt-3 h-3 w-1/2 rounded bg-line" />
          <div className="mt-2 h-3 w-1/3 rounded bg-line" />
        </li>
      ))}
    </ul>
  );
}

export const inputClass =
  "w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-accent focus:outline-none";

export const primaryButton =
  "rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60";

export const secondaryButton =
  "rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-medium text-ink hover:bg-paper disabled:opacity-60";

export const linkClass = "font-medium text-accent underline-offset-2 hover:underline";
