import type { Metadata } from "next";
import Link from "next/link";

import { Disclaimer } from "@/components/disclaimer";
import { CURRENT_CONSENT_VERSION, getConsentDocument } from "@/lib/behaviour/consent";
import { joinCodeSchema } from "@/lib/behaviour/schemas";
import { previewStudy } from "@/lib/behaviour/server";

import { DataKindBadge, ErrorNote } from "../../ui";
import { JoinForm } from "./join-form";

export const metadata: Metadata = { title: "Join a study · BehaviourLab" };

export default async function JoinStudyPage({ params }: PageProps<"/behaviour/join/[code]">) {
  const { code: raw } = await params;
  const code = joinCodeSchema.safeParse(decodeURIComponent(raw));
  const result = code.success ? await previewStudy(code.data) : null;
  const preview = result?.status === "found" ? result.preview : null;
  const consent = getConsentDocument(CURRENT_CONSENT_VERSION);

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <Link href="/behaviour" className="text-sm font-medium text-behaviour hover:underline">
          ← BehaviourLab
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Join a study</h1>
      </header>

      {result?.status === "throttled" ? (
        <ErrorNote>{result.message}</ErrorNote>
      ) : !preview || !code.success || !consent ? (
        <ErrorNote>
          No active study uses that join code. Check the code with the researcher who gave it to
          you.
        </ErrorNote>
      ) : (
        <>
          <section className="space-y-2 rounded-2xl border border-line bg-card p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">{preview.title}</h2>
              <DataKindBadge synthetic={preview.synthetic} />
            </div>
            {preview.description && (
              <p className="whitespace-pre-line text-sm leading-6 text-ink-soft">
                {preview.description}
              </p>
            )}
            <p className="text-sm text-muted">
              {preview.prompts_per_day} {preview.prompts_per_day === 1 ? "check-in" : "check-ins"} a
              day for {preview.duration_days} days. Each takes about a minute.
            </p>
            {preview.synthetic && (
              <p className="text-sm text-behaviour">
                This is a practice study using synthetic data. Your answers are labelled synthetic
                and are not research data.
              </p>
            )}
          </section>

          <article
            aria-labelledby="consent-heading"
            className="space-y-4 rounded-2xl border border-line bg-card p-5"
            data-testid="consent-text"
          >
            <header>
              <h2 id="consent-heading" className="font-semibold">
                {consent.title}
              </h2>
              <p className="text-xs text-muted">Version {consent.version}</p>
            </header>
            {consent.sections.map((section) => (
              <section key={section.heading}>
                <h3 className="text-sm font-semibold">{section.heading}</h3>
                <p className="mt-1 text-sm leading-6 text-ink-soft">{section.body}</p>
              </section>
            ))}
          </article>

          <JoinForm
            code={code.data}
            consentVersion={consent.version}
            alreadyJoined={preview.already_joined}
          />
        </>
      )}

      <Disclaimer />
    </div>
  );
}
