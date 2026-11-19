import type { Metadata } from "next";
import Link from "next/link";

import { countExperiments, getProfile } from "@/lib/account";
import { requireUser } from "@/lib/auth";

import { DeleteHistory, DisplayNameForm } from "./settings-forms";

export const metadata: Metadata = { title: "Settings" };

const ROLE_LABEL = { student: "Student", researcher: "Researcher", admin: "Admin" } as const;

export default async function SettingsPage() {
  const user = await requireUser();
  const [profile, count] = await Promise.all([getProfile(user.id), countExperiments(user.id)]);

  return (
    <div className="max-w-3xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-ink-soft">Your profile and the data NeuroTrack keeps about you.</p>
      </header>

      <section
        aria-labelledby="profile"
        className="space-y-4 rounded-2xl border border-line bg-card p-6"
      >
        <h2 id="profile" className="text-lg font-semibold">
          Profile
        </h2>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
          <dt className="text-muted">Email</dt>
          <dd className="break-all">{user.email ?? "Not set"}</dd>
          <dt className="text-muted">Role</dt>
          <dd>{profile ? ROLE_LABEL[profile.role] : "Unknown"}</dd>
        </dl>
        {profile ? (
          <DisplayNameForm initial={profile.display_name ?? ""} />
        ) : (
          <p role="alert" className="text-sm text-red-700">
            Your profile could not be loaded. Try again shortly.
          </p>
        )}
      </section>

      <section
        aria-labelledby="data"
        className="space-y-4 rounded-2xl border border-line bg-card p-6"
      >
        <h2 id="data" className="text-lg font-semibold">
          Your data
        </h2>
        <p className="text-sm leading-6 text-ink-soft">
          You have <strong>{count === null ? "an unknown number of" : count}</strong> saved
          experiment
          {count === 1 ? "" : "s"}. Read the{" "}
          <Link href="/privacy" className="underline hover:text-ink">
            privacy notice
          </Link>{" "}
          for what is stored and why.
        </p>

        <div className="space-y-2">
          <h3 className="font-medium">Download my data</h3>
          <p className="text-sm text-ink-soft">
            A JSON file with your profile, saved experiments, research history and BehaviourLab
            participation.
          </p>
          {/* A plain link: the route handler streams a file download. Not prefetched. */}
          <a
            href="/settings/export"
            download
            className="inline-block rounded-lg border border-line px-4 py-2 text-sm font-medium hover:border-ink-soft"
          >
            Download my data (JSON)
          </a>
        </div>

        <div className="space-y-2 border-t border-line pt-4">
          <h3 className="font-medium">Delete my experiment history</h3>
          <p className="text-sm text-ink-soft">
            Removes every saved experiment from every lab. Your account stays open.
          </p>
          <DeleteHistory count={count} />
        </div>
      </section>
    </div>
  );
}
