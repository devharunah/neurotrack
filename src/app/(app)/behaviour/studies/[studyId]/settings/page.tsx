import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { getStudy } from "@/lib/behaviour/server";

import { DataKindBadge, EthicsNotice } from "../../../ui";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Study settings · BehaviourLab" };

export default async function StudySettingsPage({
  params,
}: PageProps<"/behaviour/studies/[studyId]/settings">) {
  const { studyId } = await params;
  const [user, study] = await Promise.all([requireUser(), getStudy(studyId)]);
  if (!study) {
    notFound();
  }
  const isOwner = study.owner_id === user.id;

  return (
    <div className="max-w-4xl space-y-6">
      <header>
        <Link
          href={`/behaviour/studies/${study.id}`}
          className="text-sm font-medium text-behaviour hover:underline"
        >
          ← Study dashboard
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Settings: {study.title}</h1>
          <DataKindBadge synthetic={study.synthetic} />
        </div>
      </header>

      <EthicsNotice />

      {isOwner ? (
        <SettingsForm
          studyId={study.id}
          initial={{
            title: study.title,
            description: study.description,
            status: study.status,
            synthetic: study.synthetic,
            ethics_approval_ref: study.ethics_approval_ref ?? "",
            questionnaire: study.questionnaire,
            schedule: study.schedule,
          }}
        />
      ) : (
        <p className="rounded-lg border border-line bg-card px-4 py-3 text-sm text-ink-soft">
          Only the study owner can change these settings.
        </p>
      )}
    </div>
  );
}
