"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { joinStudyAction } from "../../actions";
import { primaryButton } from "../../ui";

export function JoinForm({
  code,
  consentVersion,
  alreadyJoined,
}: {
  code: string;
  consentVersion: string;
  alreadyJoined: boolean;
}) {
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<{ pseudonym: string; studyId: string } | null>(null);
  const [pending, startTransition] = useTransition();

  if (joined) {
    return (
      <section
        className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5"
        data-testid="join-success"
        aria-live="polite"
      >
        <h2 className="font-semibold text-emerald-900">You have joined the study</h2>
        <p className="text-sm text-emerald-900">
          Your pseudonym is{" "}
          <span className="rounded bg-white px-2 py-0.5 font-mono text-base font-semibold">
            {joined.pseudonym}
          </span>
          . Researchers see only this pseudonym, never your name or email.
        </p>
        <Link
          href={`/behaviour/participate/${joined.studyId}`}
          className={`${primaryButton} inline-block`}
        >
          Go to your first check-in
        </Link>
      </section>
    );
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!agreed) {
      setError("Tick the box to confirm your consent.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await joinStudyAction({ code, consentVersion, agreed });
      if (result.ok) {
        setJoined(result.data);
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-line bg-card p-5">
      {alreadyJoined && (
        <p className="text-sm text-ink-soft">
          You already take part in this study. Confirming again keeps your existing pseudonym.
        </p>
      )}
      <label className="flex items-start gap-3 text-sm leading-6">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-1 size-4 accent-behaviour"
        />
        <span>
          I have read the information above (version {consentVersion}), I am 18 or older, and I
          consent to take part. I understand I can withdraw at any time.
        </span>
      </label>
      <button type="submit" disabled={pending || !agreed} className={primaryButton}>
        {pending ? "Joining…" : "I consent, join the study"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </form>
  );
}
