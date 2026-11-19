"use client";

import { useState, useTransition } from "react";

import {
  ENVIRONMENTS,
  ENVIRONMENT_LABELS,
  FIELD_LABELS,
  MAX_TEXT_ANSWER,
  type Questionnaire,
  SCORE_FIELDS,
  SOCIAL_CONTEXTS,
  SOCIAL_CONTEXT_LABELS,
  type ScoreField,
  observationSchema,
} from "@/lib/behaviour/schemas";

import { submitObservationAction } from "../../actions";
import { inputClass, primaryButton } from "../../ui";

const SCORES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/** `YYYY-MM-DDTHH:mm` in the browser's own zone, for a datetime-local input. */
function localInputValue(date: Date): string {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

function ScoreInput({
  name,
  label,
  value,
  onChange,
}: {
  name: string;
  label: string;
  value: number | null;
  onChange: (value: number) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="grid grid-cols-11 gap-1" role="radiogroup" aria-label={label}>
        {SCORES.map((score) => (
          <label
            key={score}
            className={`flex h-9 cursor-pointer items-center justify-center rounded-md border text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
              value === score
                ? "border-behaviour bg-behaviour font-semibold text-white"
                : "border-line bg-white hover:bg-paper"
            }`}
          >
            <input
              type="radio"
              name={name}
              value={score}
              checked={value === score}
              onChange={() => onChange(score)}
              className="sr-only"
              aria-label={`${label}: ${score}`}
            />
            {score}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

type Scores = Record<ScoreField, number | null>;

export function ObservationForm({
  studyId,
  questionnaire,
}: {
  studyId: string;
  questionnaire: Questionnaire;
}) {
  const { fields } = questionnaire;
  const [when, setWhen] = useState(() => localInputValue(new Date()));
  const [scores, setScores] = useState<Scores>({
    mood: null,
    stress: null,
    sleep_quality: null,
    craving_intensity: null,
  });
  const [environment, setEnvironment] = useState("");
  const [social, setSocial] = useState("");
  const [substance, setSubstance] = useState<"yes" | "no" | "skip">("skip");
  const [answers, setAnswers] = useState<Record<string, number | string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setScores({ mood: null, stress: null, sleep_quality: null, craving_intensity: null });
    setEnvironment("");
    setSocial("");
    setSubstance("skip");
    setAnswers({});
    setWhen(localInputValue(new Date()));
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setSaved(false);
    const observedAt = new Date(when);
    const payload: Record<string, unknown> = {
      observed_at: Number.isNaN(observedAt.getTime()) ? "" : observedAt.toISOString(),
      answers: Object.fromEntries(
        Object.entries(answers).filter(([, v]) => !(typeof v === "string" && v.trim() === "")),
      ),
    };
    for (const field of SCORE_FIELDS) {
      if (fields[field]) {
        payload[field] = scores[field];
      }
    }
    if (fields.environment) {
      payload["environment"] = environment || null;
    }
    if (fields.social_context) {
      payload["social_context"] = social || null;
    }
    if (fields.substance_use) {
      payload["substance_use"] = substance === "skip" ? null : substance === "yes";
    }

    const checked = observationSchema(questionnaire).safeParse(payload);
    if (!checked.success) {
      setError(checked.error.issues[0]?.message ?? "Please check your answers.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await submitObservationAction(studyId, payload);
      if (result.ok) {
        setSaved(true);
        reset();
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <form
      onSubmit={submit}
      className="space-y-5 rounded-2xl border border-line bg-card p-5"
      aria-labelledby="checkin-heading"
      data-testid="observation-form"
    >
      <h2 id="checkin-heading" className="font-semibold">
        New check-in
      </h2>

      <label className="block text-sm">
        When
        <input
          type="datetime-local"
          className={`${inputClass} max-w-64`}
          value={when}
          max={localInputValue(new Date())}
          onChange={(e) => setWhen(e.target.value)}
          required
        />
        <span className="text-xs text-muted">Now, or any time in the last 7 days.</span>
      </label>

      {SCORE_FIELDS.filter((field) => fields[field]).map((field) => (
        <ScoreInput
          key={field}
          name={field}
          label={FIELD_LABELS[field].prompt}
          value={scores[field]}
          onChange={(value) => setScores({ ...scores, [field]: value })}
        />
      ))}

      {fields.environment && (
        <label className="block text-sm font-medium">
          {FIELD_LABELS.environment.prompt}
          <select
            className={inputClass}
            value={environment}
            onChange={(e) => setEnvironment(e.target.value)}
          >
            <option value="">Choose…</option>
            {ENVIRONMENTS.map((key) => (
              <option key={key} value={key}>
                {ENVIRONMENT_LABELS[key]}
              </option>
            ))}
          </select>
        </label>
      )}

      {fields.social_context && (
        <label className="block text-sm font-medium">
          {FIELD_LABELS.social_context.prompt}
          <select className={inputClass} value={social} onChange={(e) => setSocial(e.target.value)}>
            <option value="">Choose…</option>
            {SOCIAL_CONTEXTS.map((key) => (
              <option key={key} value={key}>
                {SOCIAL_CONTEXT_LABELS[key]}
              </option>
            ))}
          </select>
        </label>
      )}

      {fields.substance_use && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{FIELD_LABELS.substance_use.prompt}</legend>
          <div className="flex flex-wrap gap-4 text-sm">
            {(
              [
                ["skip", "Prefer not to say"],
                ["no", "No"],
                ["yes", "Yes"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="substance_use"
                  value={value}
                  checked={substance === value}
                  onChange={() => setSubstance(value)}
                  className="accent-behaviour"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {questionnaire.custom.map((question) =>
        question.type === "scale" ? (
          <ScoreInput
            key={question.id}
            name={question.id}
            label={`${question.prompt} (optional, 0–10)`}
            value={
              typeof answers[question.id] === "number" ? (answers[question.id] as number) : null
            }
            onChange={(value) => setAnswers({ ...answers, [question.id]: value })}
          />
        ) : (
          <label key={question.id} className="block text-sm font-medium">
            {question.prompt} <span className="font-normal text-muted">(optional)</span>
            <input
              className={inputClass}
              maxLength={MAX_TEXT_ANSWER}
              value={typeof answers[question.id] === "string" ? String(answers[question.id]) : ""}
              onChange={(e) => setAnswers({ ...answers, [question.id]: e.target.value })}
            />
          </label>
        ),
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={primaryButton}>
          {pending ? "Saving…" : "Save check-in"}
        </button>
        {saved && (
          <output className="block text-sm text-emerald-700">Check-in saved. Thank you.</output>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </form>
  );
}
