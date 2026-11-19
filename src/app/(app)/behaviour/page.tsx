import type { Metadata } from "next";
import Link from "next/link";

import { Disclaimer } from "@/components/disclaimer";
import { requireUser } from "@/lib/auth";
import { listMyParticipations, listMyStudies } from "@/lib/behaviour/server";

import { CreateStudyForm, JoinCodeForm } from "./home-forms";
import { DataKindBadge, EthicsNotice, StatusBadge } from "./ui";

export const metadata: Metadata = { title: "BehaviourLab" };

export default async function BehaviourLabPage() {
  const user = await requireUser();
  const [studies, participations] = await Promise.all([
    listMyStudies(user.id),
    listMyParticipations(),
  ]);

  return (
    <div className="max-w-6xl space-y-8">
      <header>
        <p className="text-sm font-medium text-behaviour">BehaviourLab</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Studies</h1>
        <p className="mt-2 max-w-3xl leading-7 text-ink-soft">
          Run consented, pseudonymous studies of how stress, sleep, mood and context relate to
          reported cravings. Results are aggregate associations with their uncertainty, never
          causes, diagnoses or predictions about a person.
        </p>
      </header>

      <EthicsNotice />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-8">
          <section aria-labelledby="run-heading">
            <h2 id="run-heading" className="text-lg font-semibold">
              Studies you run
            </h2>
            {studies.length === 0 ? (
              <p className="mt-2 rounded-2xl border border-dashed border-line p-6 text-sm text-ink-soft">
                No studies yet. Create one to design a questionnaire, then generate synthetic data
                to try the dashboard and the association analysis.
              </p>
            ) : (
              <ul
                className="mt-3 divide-y divide-line rounded-2xl border border-line bg-card"
                data-testid="my-studies"
              >
                {studies.map((study) => (
                  <li key={study.id}>
                    <Link
                      href={`/behaviour/studies/${study.id}`}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-paper"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{study.title}</span>
                        <span className="text-xs text-muted">
                          {study.isOwner ? "Owner" : "Researcher"} · {study.participants}{" "}
                          {study.participants === 1 ? "participant" : "participants"}
                        </span>
                      </span>
                      <span className="flex items-center gap-2">
                        <StatusBadge status={study.status} />
                        <DataKindBadge synthetic={study.synthetic} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="part-heading">
            <h2 id="part-heading" className="text-lg font-semibold">
              Studies you take part in
            </h2>
            {participations.length === 0 ? (
              <p className="mt-2 rounded-2xl border border-dashed border-line p-6 text-sm text-ink-soft">
                You are not taking part in any study. If a researcher gave you a join code, enter it
                on the right.
              </p>
            ) : (
              <ul
                className="mt-3 divide-y divide-line rounded-2xl border border-line bg-card"
                data-testid="my-participations"
              >
                {participations.map((p) => (
                  <li key={p.study_id}>
                    <Link
                      href={`/behaviour/participate/${p.study_id}`}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-paper"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{p.title}</span>
                        <span className="text-xs text-muted">
                          You are <span className="font-mono">{p.pseudonym}</span> ·{" "}
                          {p.observation_count} check-ins ·{" "}
                          {p.consent_active ? "consent active" : "consent withdrawn"}
                        </span>
                      </span>
                      <DataKindBadge synthetic={p.synthetic} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <CreateStudyForm />
          <JoinCodeForm />
        </aside>
      </div>

      <Disclaimer>
        BehaviourLab is for research and learning. It does not diagnose, predict relapse or
        recommend treatment, and associations it reports are not causes.
      </Disclaimer>
    </div>
  );
}
