"use client";

import { useId, useMemo, useState, useTransition } from "react";

import {
  RW_MAX_TRIALS,
  type RwParams,
  type RwResult,
  rwParamsSchema,
  simulateRescorlaWagner,
} from "@/lib/models/rescorla-wagner";
import {
  STRESS_MAX_EFFECT,
  type Stress,
  type StressTarget,
  stressMultipliers,
} from "@/lib/models/stress";
import {
  TD_MAX_DELAY,
  TD_MAX_TRIALS,
  type TdParams,
  type TdResult,
  cueAndRewardDeltas,
  simulateTd,
  tdParamsSchema,
} from "@/lib/models/td-learning";

import { saveRewardRunAction } from "./actions";
import { RwErrorChart, RwValueChart, TdHeatStrip, TdShiftChart } from "./charts";

type RwSettings = Omit<RwParams, "stress" | "initialV">;
type TdSettings = Omit<TdParams, "stress">;

export const RW_PRESETS = {
  acquisition: {
    label: "Acquisition",
    description: "Every trial rewarded. V rises quickly, then levels off at λ.",
    settings: {
      alpha: 0.5,
      beta: 0.3,
      lambda: 1,
      acquisitionTrials: 40,
      extinctionTrials: 0,
      rewardProbability: 1,
      seed: 1,
    },
  },
  extinction: {
    label: "Extinction",
    description: "30 rewarded trials, then 40 with no reward. V decays back towards 0.",
    settings: {
      alpha: 0.5,
      beta: 0.3,
      lambda: 1,
      acquisitionTrials: 30,
      extinctionTrials: 40,
      rewardProbability: 1,
      seed: 1,
    },
  },
  partial: {
    label: "Partial reinforcement",
    description:
      "Half the trials rewarded at random (seeded). V fluctuates around pλ = 0.5 instead of reaching λ.",
    settings: {
      alpha: 0.5,
      beta: 0.3,
      lambda: 1,
      acquisitionTrials: 80,
      extinctionTrials: 0,
      rewardProbability: 0.5,
      seed: 1,
    },
  },
} as const satisfies Record<string, { label: string; description: string; settings: RwSettings }>;

type PresetKey = keyof typeof RW_PRESETS;

const TD_DEFAULTS: TdSettings = {
  alpha: 0.2,
  gamma: 0.98,
  reward: 1,
  delaySteps: 6,
  trials: 120,
  rewardProbability: 1,
  seed: 1,
};

function Slider({
  label,
  value,
  min,
  max,
  step,
  help,
  format = (v) => String(v),
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  help?: string;
  format?: (v: number) => string;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div className="text-sm">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id} className="font-mono text-ink">
          {format(value)}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-neuro"
      />
      {help && <p className="text-xs leading-5 text-muted">{help}</p>}
    </div>
  );
}

function useSave() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const save = (payload: unknown) => {
    setMessage(null);
    startTransition(async () => {
      const response = await saveRewardRunAction(payload);
      setMessage(
        response.ok
          ? { ok: true, text: "Run saved to your history." }
          : { ok: false, text: response.error },
      );
    });
  };
  return { pending, message, save };
}

function SaveButton({
  onClick,
  state,
}: { onClick: () => void; state: ReturnType<typeof useSave> }) {
  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={onClick}
        disabled={state.pending}
        className="w-full rounded-lg border border-neuro px-4 py-2 text-sm font-medium text-neuro hover:bg-neuro-soft disabled:opacity-60"
      >
        {state.pending ? "Saving…" : "Save this run"}
      </button>
      {state.message && (
        <p
          role={state.message.ok ? "status" : "alert"}
          className={`text-xs ${state.message.ok ? "text-accent" : "text-red-700"}`}
        >
          {state.message.text}
        </p>
      )}
    </div>
  );
}

function StressPanel({ stress, onChange }: { stress: Stress; onChange: (s: Stress) => void }) {
  const targets: { value: StressTarget; label: string }[] = [
    { value: "reward-sensitivity", label: "Reward sensitivity (λ, r)" },
    { value: "learning-rate", label: "Learning rate (β, α)" },
  ];
  return (
    <section
      aria-labelledby="stress-heading"
      className="rounded-2xl border border-dashed border-behaviour bg-behaviour-soft/40 p-5"
    >
      <h2 id="stress-heading" className="font-semibold">
        Stress <span className="text-behaviour">(hypothetical modulation)</span>
      </h2>
      <p className="mt-1 text-xs leading-5 text-ink-soft">
        A &ldquo;what if&rdquo; control, not an empirical relationship. It multiplies one parameter
        by 1 − {STRESS_MAX_EFFECT}·s, so s = 1 halves it. The form, direction and size of this
        effect were chosen for exploration and are not taken from data. It applies to both models
        below.
      </p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <Slider
          label="Stress level s"
          value={stress.level}
          min={0}
          max={1}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(level) => onChange({ ...stress, level })}
        />
        <fieldset className="text-sm">
          <legend>Hypothetically scales</legend>
          <div className="mt-1 space-y-1">
            {targets.map((t) => (
              <label key={t.value} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="stress-target"
                  value={t.value}
                  checked={stress.target === t.value}
                  onChange={() => onChange({ ...stress, target: t.value })}
                  className="accent-neuro"
                />
                {t.label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    </section>
  );
}

function RescorlaWagnerLab({ stress }: { stress: Stress }) {
  const [settings, setSettings] = useState<RwSettings>(RW_PRESETS.acquisition.settings);
  const [preset, setPreset] = useState<PresetKey | null>("acquisition");
  const saveState = useSave();

  const update = (patch: Partial<RwSettings>) => {
    setPreset(null);
    setSettings((s) => ({ ...s, ...patch }));
  };

  const run = useMemo((): { result: RwResult } | { error: string } => {
    const parsed = rwParamsSchema.safeParse({ ...settings, stress });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid parameters." };
    }
    return { result: simulateRescorlaWagner(parsed.data) };
  }, [settings, stress]);

  return (
    <section aria-labelledby="rw-heading" className="space-y-4">
      <header>
        <h2 id="rw-heading" className="text-lg font-semibold">
          Rescorla-Wagner: learning what a cue predicts
        </h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-ink-soft">
          On each trial the cue&rsquo;s associative strength V moves a fraction αβ of the way
          towards λ: <span className="font-mono">ΔV = αβ(λ − V)</span>. The bigger the surprise (λ −
          V), the bigger the change. λ is the reward magnitude on rewarded trials and 0 otherwise.
        </p>
      </header>
      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="space-y-4 rounded-2xl border border-line bg-card p-5">
          <fieldset>
            <legend className="text-sm font-medium">Presets</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {(Object.keys(RW_PRESETS) as PresetKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={preset === key}
                  onClick={() => {
                    setPreset(key);
                    setSettings(RW_PRESETS[key].settings);
                  }}
                  className={`rounded-lg border px-3 py-1.5 text-sm ${
                    preset === key
                      ? "border-neuro bg-neuro-soft text-neuro"
                      : "border-line hover:bg-paper"
                  }`}
                >
                  {RW_PRESETS[key].label}
                </button>
              ))}
            </div>
            {preset && (
              <p className="mt-2 text-xs leading-5 text-muted">{RW_PRESETS[preset].description}</p>
            )}
          </fieldset>
          <Slider
            label="Cue salience α"
            value={settings.alpha}
            min={0}
            max={1}
            step={0.05}
            format={(v) => v.toFixed(2)}
            help="How noticeable the cue is."
            onChange={(alpha) => update({ alpha })}
          />
          <Slider
            label="Learning rate β"
            value={settings.beta}
            min={0}
            max={1}
            step={0.05}
            format={(v) => v.toFixed(2)}
            help="How much the outcome drives learning."
            onChange={(beta) => update({ beta })}
          />
          <Slider
            label="Reward magnitude λ"
            value={settings.lambda}
            min={0}
            max={2}
            step={0.1}
            format={(v) => v.toFixed(1)}
            help="The most V can reach with this reward."
            onChange={(lambda) => update({ lambda })}
          />
          <Slider
            label="Acquisition trials"
            value={settings.acquisitionTrials}
            min={0}
            max={RW_MAX_TRIALS - settings.extinctionTrials}
            step={1}
            onChange={(acquisitionTrials) => update({ acquisitionTrials })}
          />
          <Slider
            label="Extinction trials"
            value={settings.extinctionTrials}
            min={0}
            max={RW_MAX_TRIALS - settings.acquisitionTrials}
            step={1}
            help="Trials with no reward (λ = 0) after acquisition."
            onChange={(extinctionTrials) => update({ extinctionTrials })}
          />
          <Slider
            label="Reward probability p"
            value={settings.rewardProbability}
            min={0}
            max={1}
            step={0.05}
            format={(v) => v.toFixed(2)}
            help="Chance that an acquisition trial is rewarded. Below 1 is partial reinforcement."
            onChange={(rewardProbability) => update({ rewardProbability })}
          />
          <Slider
            label="Random seed"
            value={settings.seed}
            min={0}
            max={99}
            step={1}
            help="Same seed, same sequence of rewarded trials."
            onChange={(seed) => update({ seed })}
          />
          <SaveButton
            state={saveState}
            onClick={() =>
              saveState.save({ model: "rescorla-wagner", params: { ...settings, stress } })
            }
          />
        </div>
        <div className="min-w-0 space-y-4">
          {"error" in run ? (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm">
              {run.error}
            </p>
          ) : (
            <>
              <RwSummary result={run.result} />
              <div className="grid gap-4 xl:grid-cols-2">
                <RwValueChart
                  trials={run.result.trials}
                  acquisitionTrials={settings.acquisitionTrials}
                  asymptote={settings.lambda * stressMultipliers(stress).reward}
                />
                <RwErrorChart trials={run.result.trials} />
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function RwSummary({ result }: { result: RwResult }) {
  const last = result.trials.at(-1);
  const rewarded = result.trials.filter((t) => t.rewarded).length;
  return (
    <dl className="grid grid-cols-3 gap-3 text-sm" data-testid="rw-summary" aria-live="polite">
      <div className="rounded-xl border border-line bg-card p-3">
        <dt className="text-xs text-muted">Final V</dt>
        <dd className="font-mono text-lg">{(last?.v ?? 0).toFixed(3)}</dd>
      </div>
      <div className="rounded-xl border border-line bg-card p-3">
        <dt className="text-xs text-muted">Rewarded trials</dt>
        <dd className="font-mono text-lg">
          {rewarded}/{result.trials.length}
        </dd>
      </div>
      <div className="rounded-xl border border-line bg-card p-3">
        <dt className="text-xs text-muted">Effective αβ</dt>
        <dd className="font-mono text-lg">{result.effectiveRate.toFixed(3)}</dd>
      </div>
    </dl>
  );
}

function TdLab({ stress }: { stress: Stress }) {
  const [settings, setSettings] = useState<TdSettings>(TD_DEFAULTS);
  const saveState = useSave();
  const update = (patch: Partial<TdSettings>) => setSettings((s) => ({ ...s, ...patch }));

  const run = useMemo((): { result: TdResult } | { error: string } => {
    const parsed = tdParamsSchema.safeParse({ ...settings, stress });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid parameters." };
    }
    return { result: simulateTd(parsed.data) };
  }, [settings, stress]);

  const series = useMemo(() => ("result" in run ? cueAndRewardDeltas(run.result) : []), [run]);
  const first = series[0];
  const last = series.at(-1);

  return (
    <section aria-labelledby="td-heading" className="space-y-4">
      <header>
        <h2 id="td-heading" className="text-lg font-semibold">
          Temporal-difference learning: when does the surprise happen?
        </h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-ink-soft">
          TD(0) learns a value for every moment between the cue and the reward. Its prediction error{" "}
          <span className="font-mono">δ(t) = r(t) + γV(t) − V(t−1)</span> is large at the reward
          while the reward is unexpected. Once the cue reliably predicts it, the error moves to the
          cue, because the cue now arrives unexpectedly and the reward does not. Recordings from
          monkey midbrain dopamine neurons show a similar shift (Schultz, Dayan &amp; Montague,
          1997), but δ here is a model quantity, not a dopamine measurement.
        </p>
      </header>
      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="space-y-4 rounded-2xl border border-line bg-card p-5">
          <Slider
            label="Learning rate α"
            value={settings.alpha}
            min={0}
            max={1}
            step={0.05}
            format={(v) => v.toFixed(2)}
            onChange={(alpha) => update({ alpha })}
          />
          <Slider
            label="Discount γ"
            value={settings.gamma}
            min={0}
            max={1}
            step={0.01}
            format={(v) => v.toFixed(2)}
            help="How much a reward one step later is worth now."
            onChange={(gamma) => update({ gamma })}
          />
          <Slider
            label="Reward r"
            value={settings.reward}
            min={0}
            max={2}
            step={0.1}
            format={(v) => v.toFixed(1)}
            onChange={(reward) => update({ reward })}
          />
          <Slider
            label="Delay steps (cue → reward)"
            value={settings.delaySteps}
            min={1}
            max={TD_MAX_DELAY}
            step={1}
            onChange={(delaySteps) => update({ delaySteps })}
          />
          <Slider
            label="Trials"
            value={settings.trials}
            min={1}
            max={TD_MAX_TRIALS}
            step={1}
            onChange={(trials) => update({ trials })}
          />
          <Slider
            label="Reward probability"
            value={settings.rewardProbability}
            min={0}
            max={1}
            step={0.05}
            format={(v) => v.toFixed(2)}
            help="Below 1, omitted rewards produce a negative δ at reward time."
            onChange={(rewardProbability) => update({ rewardProbability })}
          />
          <Slider
            label="Random seed"
            value={settings.seed}
            min={0}
            max={99}
            step={1}
            onChange={(seed) => update({ seed })}
          />
          <SaveButton
            state={saveState}
            onClick={() => saveState.save({ model: "td", params: { ...settings, stress } })}
          />
        </div>
        <div className="min-w-0 space-y-4">
          {"error" in run ? (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm">
              {run.error}
            </p>
          ) : (
            <>
              <p className="text-sm text-ink-soft" data-testid="td-summary" aria-live="polite">
                Trial {first?.trial}: δ at cue{" "}
                <span className="font-mono">{first?.cue.toFixed(3)}</span>, δ at reward{" "}
                <span className="font-mono">{first?.reward.toFixed(3)}</span>. Trial {last?.trial}:
                δ at cue <span className="font-mono">{last?.cue.toFixed(3)}</span>, δ at reward{" "}
                <span className="font-mono">{last?.reward.toFixed(3)}</span>.
              </p>
              <div className="grid gap-4 xl:grid-cols-2">
                <TdShiftChart series={series} />
                <TdHeatStrip result={run.result} />
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

export function RewardLab() {
  const [stress, setStress] = useState<Stress>({ level: 0, target: "reward-sensitivity" });
  return (
    <div className="space-y-10">
      <StressPanel stress={stress} onChange={setStress} />
      <RescorlaWagnerLab stress={stress} />
      <TdLab stress={stress} />
    </div>
  );
}
