import type { Metadata } from "next";
import Link from "next/link";

import { Disclaimer } from "@/components/disclaimer";
import { listExperiments } from "@/lib/experiments";

import { RewardLab } from "./reward-lab";

export const metadata: Metadata = { title: "Reward-learning simulator · NeuroLab" };

export default async function RewardLearningPage() {
  const history = await listExperiments("neuro", 8);

  return (
    <div className="max-w-7xl space-y-8">
      <header>
        <Link href="/neuro" className="text-sm font-medium text-neuro hover:underline">
          ← NeuroLab brain explorer
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Reward-learning simulator</h1>
        <p className="mt-2 max-w-3xl leading-7 text-ink-soft">
          Two established models of how an animal (or an algorithm) learns that a cue predicts a
          reward. Move the sliders and the models recompute instantly in your browser. Both are
          abstract mathematical models of learning: their values and prediction errors are not
          simulations of dopamine or of any measured brain signal.
        </p>
      </header>

      <details className="max-w-3xl rounded-2xl border border-line bg-card p-5 text-sm leading-6 text-ink-soft">
        <summary className="cursor-pointer font-semibold text-ink">
          How to read these models
        </summary>
        <div className="mt-3 space-y-3">
          <p>
            <strong className="text-ink">Prediction error</strong> is the difference between what
            happened and what was expected. Both models learn by nudging their predictions in the
            direction of the error, so learning is fastest when outcomes are most surprising.
          </p>
          <p>
            <strong className="text-ink">Rescorla-Wagner</strong> (1972) works trial by trial. It
            explains acquisition (V rises towards λ), extinction (V decays when the reward stops)
            and why partially reinforced cues settle at a lower value. It has no notion of time
            within a trial.
          </p>
          <p>
            <strong className="text-ink">Temporal-difference learning</strong> (Sutton, 1988) adds
            time within a trial. Its prediction error moves from the reward to the cue as learning
            proceeds, which resembles how many midbrain dopamine neurons in monkeys change their
            responses during conditioning (Schultz, Dayan &amp; Montague, 1997).
          </p>
          <p>
            Full equations, assumptions and limitations are in the model cards{" "}
            <code className="font-mono text-xs">docs/models/rescorla-wagner.md</code> and{" "}
            <code className="font-mono text-xs">docs/models/td-learning.md</code>.
          </p>
        </div>
      </details>

      <RewardLab />

      <section>
        <h2 className="text-lg font-semibold">Your saved runs</h2>
        {history.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">No saved runs yet.</p>
        ) : (
          <ul
            className="mt-3 divide-y divide-line rounded-2xl border border-line bg-card"
            data-testid="neuro-run-history"
          >
            {history.map((row) => (
              <li key={row.id} className="flex flex-wrap justify-between gap-x-4 px-4 py-3 text-sm">
                <span className="font-medium">{row.title ?? row.kind}</span>
                <time className="text-muted" dateTime={row.created_at}>
                  {new Date(row.created_at).toLocaleString()}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Disclaimer>
        These are educational models of learning. They do not measure or simulate dopamine, and they
        say nothing about any individual. The stress control is a hypothetical modulation, not an
        empirical relationship.
      </Disclaimer>
    </div>
  );
}
