"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { clearSyntheticAction, seedSyntheticAction } from "../../actions";
import { inputClass, primaryButton, secondaryButton } from "../../ui";

export function SeederPanel({ studyId }: { studyId: string }) {
  const router = useRouter();
  const [settings, setSettings] = useState({ participants: 24, days: 30, seed: 7 });
  const [includePractice, setIncludePractice] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (kind: "seed" | "clear") => {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      if (kind === "seed") {
        const result = await seedSyntheticAction(studyId, settings);
        if (result.ok) {
          setMessage(
            `Generated ${result.data.participants} synthetic participants and ${result.data.observations.toLocaleString("en-GB")} synthetic observations.`,
          );
          router.refresh();
        } else {
          setError(result.error);
        }
      } else {
        const result = await clearSyntheticAction(studyId, includePractice);
        if (result.ok) {
          setMessage(`Deleted ${result.data.deleted} synthetic participants and their data.`);
          router.refresh();
        } else {
          setError(result.error);
        }
      }
    });
  };

  const field = (key: keyof typeof settings, label: string, min: number, max: number) => (
    <label className="block text-sm">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        className={inputClass}
        value={settings[key]}
        onChange={(e) => setSettings({ ...settings, [key]: Number(e.target.value) })}
      />
    </label>
  );

  return (
    <section
      aria-labelledby="seeder-heading"
      className="space-y-3 rounded-2xl border border-amber-300 bg-behaviour-soft/40 p-5"
      data-testid="seeder"
    >
      <h2 id="seeder-heading" className="font-semibold">
        Synthetic-data generator
      </h2>
      <p className="text-sm leading-6 text-ink-soft">
        Creates pseudonymous <strong>synthetic</strong> participants (S- pseudonyms) and about a
        month of check-ins from a seeded random generator. The data has built-in associations
        (craving rises with stress and in the evening, falls with sleep quality and mood) so the
        analysis has something to find. Same seed, same data.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {field("participants", "Participants (3–60)", 3, 60)}
        {field("days", "Days (7–60)", 7, 60)}
        {field("seed", "Random seed", 0, 2_147_483_647)}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={primaryButton}
          disabled={pending}
          onClick={() => run("seed")}
        >
          {pending ? "Working…" : "Generate synthetic data"}
        </button>
        <button
          type="button"
          className={secondaryButton}
          disabled={pending}
          onClick={() => run("clear")}
        >
          Delete generated data
        </button>
      </div>
      <label className="flex items-start gap-2 text-xs text-ink-soft">
        <input
          type="checkbox"
          checked={includePractice}
          onChange={(e) => setIncludePractice(e.target.checked)}
          className="mt-0.5 accent-behaviour"
        />
        When deleting, also remove practice participants who joined this synthetic study with the
        code (needed before switching the study to real data).
      </label>
      {message && <output className="block text-sm text-emerald-800">{message}</output>}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
