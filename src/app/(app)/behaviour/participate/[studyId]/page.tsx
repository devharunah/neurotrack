import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Disclaimer } from "@/components/disclaimer";
import { getMyParticipantId, getMyParticipation } from "@/lib/behaviour/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { DataKindBadge } from "../../ui";
import { ObservationForm } from "./observation-form";
import { WithdrawPanel } from "./withdraw-panel";

export const metadata: Metadata = { title: "Check in · BehaviourLab" };

async function recentCheckIns(studyId: string, participantId: string | null) {
  if (!participantId) {
    return [];
  }
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("observations")
    .select("id, observed_at, craving_intensity, mood, stress")
    .eq("study_id", studyId)
    .eq("participant_id", participantId)
    .order("observed_at", { ascending: false })
    .limit(10)
    .returns<
      {
        id: string;
        observed_at: string;
        craving_intensity: number | null;
        mood: number | null;
        stress: number | null;
      }[]
    >();
  return data ?? [];
}

export default async function ParticipatePage({
  params,
}: PageProps<"/behaviour/participate/[studyId]">) {
  const { studyId } = await params;
  const participation = await getMyParticipation(studyId);
  if (!participation) {
    notFound();
  }
  const participantId = await getMyParticipantId(studyId);
  const recent = participation.consent_active ? await recentCheckIns(studyId, participantId) : [];
  const collecting = participation.consent_active && participation.status === "active";

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <Link href="/behaviour" className="text-sm font-medium text-behaviour hover:underline">
          ← BehaviourLab
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{participation.title}</h1>
          <DataKindBadge synthetic={participation.synthetic} />
        </div>
        <p className="mt-2 text-sm text-ink-soft">
          You take part as{" "}
          <span className="font-mono font-semibold">{participation.pseudonym}</span> · consent
          version {participation.consent_version} · {participation.observation_count} check-ins so
          far
        </p>
      </header>

      {!participation.consent_active ? (
        <output
          className="block rounded-lg border border-line bg-card px-4 py-3 text-sm text-ink-soft"
          data-testid="consent-withdrawn"
        >
          You have withdrawn your consent. No new check-ins are accepted for this study.
        </output>
      ) : participation.status !== "active" ? (
        <output className="block rounded-lg border border-line bg-card px-4 py-3 text-sm">
          This study is {participation.status} and is not collecting check-ins right now.
        </output>
      ) : null}

      {collecting && (
        <ObservationForm studyId={studyId} questionnaire={participation.questionnaire} />
      )}

      {recent.length > 0 && (
        <section aria-labelledby="recent-heading">
          <h2 id="recent-heading" className="font-semibold">
            Your recent check-ins
          </h2>
          <ul className="mt-2 divide-y divide-line rounded-2xl border border-line bg-card text-sm">
            {recent.map((row) => (
              <li key={row.id} className="flex flex-wrap justify-between gap-2 px-4 py-2">
                <time dateTime={row.observed_at}>
                  {new Date(row.observed_at).toLocaleString("en-GB", {
                    timeZone: participation.schedule.timezone,
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </time>
                <span className="text-muted">
                  {[
                    row.mood !== null && `mood ${row.mood}`,
                    row.stress !== null && `stress ${row.stress}`,
                    row.craving_intensity !== null && `craving ${row.craving_intensity}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {participation.consent_active && <WithdrawPanel studyId={studyId} />}

      <Disclaimer>
        Check-ins are for research only. Nobody monitors them in real time. If you are in distress,
        contact a health professional or local support services.
      </Disclaimer>
    </div>
  );
}
