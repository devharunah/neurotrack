import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Disclaimer } from "@/components/disclaimer";
import { requireUser } from "@/lib/auth";
import { computeDashboard } from "@/lib/behaviour/analytics";
import { FIELD_LABELS, SCORE_FIELDS } from "@/lib/behaviour/schemas";
import { getStudy, loadStudyData } from "@/lib/behaviour/server";

import { DataKindBadge, ErrorNote, StatusBadge, SyntheticDataNotice } from "../../ui";
import { AnalysisPanel } from "./analysis-panel";
import { StudyCharts } from "./charts";
import { SeederPanel } from "./seeder-panel";

export const metadata: Metadata = { title: "Study · BehaviourLab" };

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-card px-4 py-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

export default async function StudyPage({ params }: PageProps<"/behaviour/studies/[studyId]">) {
  const { studyId } = await params;
  const [user, study] = await Promise.all([requireUser(), getStudy(studyId)]);
  if (!study) {
    notFound();
  }

  let loadError: string | null = null;
  let data: Awaited<ReturnType<typeof loadStudyData>> = {
    participants: [],
    consents: [],
    observations: [],
    truncated: false,
  };
  try {
    data = await loadStudyData(study.id);
  } catch {
    loadError = "Could not read this study's data. Try again in a moment.";
  }
  const dashboard = computeDashboard({ ...data, schedule: study.schedule, now: new Date() });
  const { totals } = dashboard;
  const isOwner = study.owner_id === user.id;
  const enabled = SCORE_FIELDS.filter((f) => study.questionnaire.fields[f])
    .map((f) => FIELD_LABELS[f].label.toLowerCase())
    .join(", ");

  return (
    <div className="max-w-7xl space-y-6">
      <header className="space-y-3">
        <Link href="/behaviour" className="text-sm font-medium text-behaviour hover:underline">
          ← BehaviourLab
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{study.title}</h1>
          <StatusBadge status={study.status} />
          <DataKindBadge synthetic={study.synthetic} />
        </div>
        {study.description && (
          <p className="max-w-3xl whitespace-pre-line leading-7 text-ink-soft">
            {study.description}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span>
            Join code:{" "}
            <span
              className="rounded bg-card px-2 py-1 font-mono font-semibold tracking-widest"
              data-testid="join-code"
            >
              {study.join_code}
            </span>
          </span>
          <span className="text-muted">
            {study.schedule.prompts_per_day}× a day for {study.schedule.duration_days} days ·{" "}
            {study.schedule.timezone}
            {enabled ? ` · asks ${enabled}` : ""}
          </span>
          {!study.synthetic && study.ethics_approval_ref && (
            <span className="text-muted">Ethics approval: {study.ethics_approval_ref}</span>
          )}
        </div>
        <nav className="flex flex-wrap gap-2" aria-label="Study actions">
          <Link
            href={`/behaviour/studies/${study.id}/settings`}
            className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-medium hover:bg-paper"
          >
            {isOwner ? "Settings & questionnaire" : "View settings"}
          </Link>
          <a
            href={`/behaviour/studies/${study.id}/export`}
            className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-medium hover:bg-paper"
            data-testid="export-csv"
          >
            Export CSV (pseudonymous{study.synthetic ? ", synthetic" : ""})
          </a>
        </nav>
      </header>

      {study.synthetic && <SyntheticDataNotice />}
      {loadError && <ErrorNote>{loadError}</ErrorNote>}
      {data.truncated && (
        <ErrorNote>
          This study has more rows than the dashboard reads at once; the most recent ones are shown.
        </ErrorNote>
      )}

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-5" data-testid="study-totals">
        <Stat label="Participants" value={String(totals.participants)} />
        <Stat label="Active consent" value={String(totals.activeConsents)} />
        <Stat label="Withdrawn" value={String(totals.withdrawn)} />
        <Stat label="Observations" value={totals.observations.toLocaleString("en-GB")} />
        <Stat
          label="Completed vs schedule"
          value={totals.completion === null ? "–" : `${Math.round(totals.completion * 100)}%`}
        />
      </dl>

      {study.synthetic && <SeederPanel studyId={study.id} />}

      {totals.observations === 0 ? (
        <p className="rounded-2xl border border-dashed border-line p-8 text-sm text-ink-soft">
          No observations yet.{" "}
          {study.synthetic
            ? "Generate synthetic data above, or share the join code to collect practice check-ins."
            : "Share the join code with consenting participants."}
        </p>
      ) : (
        <>
          <StudyCharts data={dashboard} synthetic={study.synthetic} />
          <AnalysisPanel studyId={study.id} synthetic={study.synthetic} />
        </>
      )}

      <Disclaimer>
        Everything on this page is aggregate and descriptive. It does not diagnose anyone, predict
        an individual&apos;s behaviour or relapse, or show that one factor causes another.
      </Disclaimer>
    </div>
  );
}
