"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  type CustomQuestion,
  FIELD_LABELS,
  MAX_CUSTOM_QUESTIONS,
  STANDARD_FIELDS,
  STUDY_STATUSES,
  type StudySettings,
  studySettingsSchema,
} from "@/lib/behaviour/schemas";

import { deleteStudyAction, updateStudySettingsAction } from "../../../actions";
import { inputClass, primaryButton, secondaryButton } from "../../../ui";

const TIME_ZONES = [
  "Africa/Kampala",
  "Africa/Nairobi",
  "Africa/Dar_es_Salaam",
  "Africa/Kigali",
  "Africa/Lagos",
  "Africa/Johannesburg",
  "Europe/London",
  "America/New_York",
  "UTC",
];

function newQuestionId(): string {
  const bytes = new Uint8Array(6);
  globalThis.crypto.getRandomValues(bytes);
  return `q_${Array.from(bytes, (b) => (b % 36).toString(36)).join("")}`;
}

export function SettingsForm({ studyId, initial }: { studyId: string; initial: StudySettings }) {
  const router = useRouter();
  const [settings, setSettings] = useState<StudySettings>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState("");

  const update = (patch: Partial<StudySettings>) => {
    setSaved(false);
    setSettings({ ...settings, ...patch });
  };
  const { questionnaire, schedule } = settings;
  const setCustom = (custom: CustomQuestion[]) =>
    update({ questionnaire: { ...questionnaire, custom } });

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = studySettingsSchema.safeParse(settings);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please check the settings.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await updateStudySettingsAction(studyId, parsed.data);
      if (result.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  };

  const remove = () => {
    startTransition(async () => {
      const result = await deleteStudyAction(studyId);
      if (result.ok) {
        router.push("/behaviour");
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <div className="space-y-6">
      <form onSubmit={save} className="space-y-6">
        <section className="space-y-3 rounded-2xl border border-line bg-card p-5">
          <h2 className="font-semibold">Study</h2>
          <label className="block text-sm">
            Title
            <input
              className={inputClass}
              value={settings.title}
              maxLength={120}
              onChange={(e) => update({ title: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            Description
            <textarea
              className={`${inputClass} min-h-24`}
              value={settings.description}
              maxLength={2000}
              onChange={(e) => update({ description: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            Status
            <select
              className={`${inputClass} max-w-48`}
              value={settings.status}
              onChange={(e) =>
                update({ status: e.target.value as (typeof STUDY_STATUSES)[number] })
              }
            >
              {STUDY_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <span className="text-xs text-muted">
              Only active studies accept new participants and check-ins.
            </span>
          </label>
        </section>

        <section
          className="space-y-3 rounded-2xl border border-line bg-card p-5"
          aria-labelledby="data-heading"
        >
          <h2 id="data-heading" className="font-semibold">
            Data source
          </h2>
          <fieldset className="space-y-2 text-sm">
            <legend className="sr-only">Synthetic or real data</legend>
            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="synthetic"
                checked={settings.synthetic}
                onChange={() => update({ synthetic: true })}
                className="mt-1 accent-behaviour"
              />
              <span>
                <strong>Synthetic data</strong> — generated or practice data only. Labelled
                synthetic everywhere.
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="synthetic"
                checked={!settings.synthetic}
                onChange={() => update({ synthetic: false })}
                className="mt-1 accent-behaviour"
              />
              <span>
                <strong>Real participant data</strong> — only with documented institutional and
                ethical approval, including applicable Ugandan requirements.
              </span>
            </label>
          </fieldset>
          <label className="block text-sm">
            Ethics approval reference{" "}
            {!settings.synthetic && <span className="text-red-700">(required)</span>}
            <input
              className={inputClass}
              value={settings.ethics_approval_ref}
              maxLength={200}
              placeholder="e.g. the committee name and approval number"
              onChange={(e) => update({ ethics_approval_ref: e.target.value })}
              aria-invalid={!settings.synthetic && settings.ethics_approval_ref.trim() === ""}
            />
          </label>
          {!settings.synthetic && settings.ethics_approval_ref.trim() === "" && (
            <p className="text-sm text-red-700">
              Real participant data needs an ethics approval reference.
            </p>
          )}
          <p className="text-xs leading-5 text-muted">
            A study cannot mix synthetic and real participants. Delete generated data before
            switching to real data; once real people have joined it cannot go back to synthetic.
          </p>
        </section>

        <section
          className="space-y-4 rounded-2xl border border-line bg-card p-5"
          aria-labelledby="questionnaire-heading"
        >
          <h2 id="questionnaire-heading" className="font-semibold">
            Questionnaire
          </h2>
          <fieldset>
            <legend className="text-sm font-medium">Standard questions</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {STANDARD_FIELDS.map((field) => (
                <label key={field} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={questionnaire.fields[field]}
                    onChange={(e) =>
                      update({
                        questionnaire: {
                          ...questionnaire,
                          fields: { ...questionnaire.fields, [field]: e.target.checked },
                        },
                      })
                    }
                    className="mt-1 accent-behaviour"
                  />
                  <span>
                    {FIELD_LABELS[field].label}
                    <span className="block text-xs text-muted">{FIELD_LABELS[field].prompt}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">
              Custom questions ({questionnaire.custom.length}/{MAX_CUSTOM_QUESTIONS})
            </legend>
            {questionnaire.custom.map((question, index) => (
              <div key={question.id} className="flex flex-wrap items-end gap-2">
                <label className="min-w-0 flex-1 text-sm">
                  Question {index + 1}
                  <input
                    className={inputClass}
                    value={question.prompt}
                    maxLength={200}
                    onChange={(e) =>
                      setCustom(
                        questionnaire.custom.map((q) =>
                          q.id === question.id ? { ...q, prompt: e.target.value } : q,
                        ),
                      )
                    }
                  />
                </label>
                <label className="text-sm">
                  Answer
                  <select
                    className={inputClass}
                    value={question.type}
                    onChange={(e) =>
                      setCustom(
                        questionnaire.custom.map((q) =>
                          q.id === question.id
                            ? { ...q, type: e.target.value === "text" ? "text" : "scale" }
                            : q,
                        ),
                      )
                    }
                  >
                    <option value="scale">Scale 0–10</option>
                    <option value="text">Short text</option>
                  </select>
                </label>
                <button
                  type="button"
                  className={secondaryButton}
                  onClick={() =>
                    setCustom(questionnaire.custom.filter((q) => q.id !== question.id))
                  }
                  aria-label={`Remove question ${index + 1}`}
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              className={secondaryButton}
              disabled={questionnaire.custom.length >= MAX_CUSTOM_QUESTIONS}
              onClick={() =>
                setCustom([
                  ...questionnaire.custom,
                  { id: newQuestionId(), prompt: "", type: "scale" },
                ])
              }
            >
              Add a custom question
            </button>
            <p className="text-xs leading-5 text-muted">
              Avoid questions that could identify someone (names, places, contact details). Custom
              answers are optional for participants.
            </p>
          </fieldset>
        </section>

        <section
          className="grid gap-3 rounded-2xl border border-line bg-card p-5 sm:grid-cols-3"
          aria-labelledby="schedule-heading"
        >
          <h2 id="schedule-heading" className="font-semibold sm:col-span-3">
            Schedule
          </h2>
          <label className="block text-sm">
            Check-ins per day
            <input
              type="number"
              min={1}
              max={6}
              className={inputClass}
              value={schedule.prompts_per_day}
              onChange={(e) =>
                update({ schedule: { ...schedule, prompts_per_day: Number(e.target.value) } })
              }
            />
          </label>
          <label className="block text-sm">
            Duration (days)
            <input
              type="number"
              min={1}
              max={365}
              className={inputClass}
              value={schedule.duration_days}
              onChange={(e) =>
                update({ schedule: { ...schedule, duration_days: Number(e.target.value) } })
              }
            />
          </label>
          <label className="block text-sm">
            Time zone
            <select
              className={inputClass}
              value={schedule.timezone}
              onChange={(e) => update({ schedule: { ...schedule, timezone: e.target.value } })}
            >
              {(TIME_ZONES.includes(schedule.timezone)
                ? TIME_ZONES
                : [schedule.timezone, ...TIME_ZONES]
              ).map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs leading-5 text-muted sm:col-span-3">
            The schedule sets how many check-ins are expected, which the dashboard uses to report
            missing observations. Times of day are read in this time zone.
          </p>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pending} className={primaryButton}>
            {pending ? "Saving…" : "Save settings"}
          </button>
          {saved && <output className="block text-sm text-emerald-700">Settings saved.</output>}
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
      </form>

      <section className="space-y-3 rounded-2xl border border-red-200 bg-card p-5">
        <h2 className="font-semibold text-red-800">Delete study</h2>
        <p className="text-sm text-ink-soft">
          Permanently deletes the study, its participants, consents, observations and export log.
          Type the study title to confirm.
        </p>
        <input
          className={`${inputClass} max-w-md`}
          value={confirmDelete}
          onChange={(e) => setConfirmDelete(e.target.value)}
          aria-label="Type the study title to confirm deletion"
        />
        <button
          type="button"
          disabled={pending || confirmDelete !== initial.title}
          onClick={remove}
          className="block rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          Delete study
        </button>
      </section>
    </div>
  );
}
