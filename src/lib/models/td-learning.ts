import { z } from "zod";

import { mulberry32 } from "./prng";
import { NO_STRESS, stressMultipliers, stressSchema } from "./stress";

/**
 * TD(0) over a single conditioning trial (Sutton, 1988; Schultz, Dayan & Montague, 1997).
 *
 * Time within a trial is discrete. The cue appears at step 0 and the reward r arrives at step
 * D = delaySteps. Each step after cue onset is its own state (a "complete serial compound", or
 * tapped delay line), so states 0 to D−1 have learnable values V(t). The pre-cue state has value 0
 * and is not learned, because the cue arrives at an unpredictable time. The state at reward time
 * ends the trial (value 0).
 *
 * The prediction error at step t is
 *
 *     δ(t) = r(t) + γ V(t) − V(t − 1),   with V(−1) = 0 and V(D) = 0,
 *
 * and each learnable state is updated with V(t − 1) ← V(t − 1) + α δ(t).
 *
 * The textbook result: early in learning δ is large at reward time. As V is learned, δ at reward
 * time shrinks towards 0 and δ at cue time grows towards γ^D r.
 *
 * Abstract model: δ is a model prediction error, not a dopamine measurement. See
 * docs/models/td-learning.md.
 */

export const TD_MAX_TRIALS = 500;
export const TD_MAX_DELAY = 20;

export const tdParamsSchema = z.object({
  alpha: z.number().min(0).max(1),
  gamma: z.number().min(0).max(1),
  reward: z.number().min(0).max(2),
  delaySteps: z.number().int().min(1).max(TD_MAX_DELAY),
  trials: z.number().int().min(1).max(TD_MAX_TRIALS),
  rewardProbability: z.number().min(0).max(1).default(1),
  seed: z.number().int().min(0).max(0xffffffff).default(1),
  stress: stressSchema.default(NO_STRESS),
});

export type TdParamsInput = z.input<typeof tdParamsSchema>;
export type TdParams = z.output<typeof tdParamsSchema>;

export interface TdTrial {
  /** 1-based trial number. */
  trial: number;
  rewarded: boolean;
  /** δ at each step: index 0 is cue onset, index D is reward time. Length D + 1. */
  delta: number[];
  /** V(0) to V(D−1) after this trial's updates. Length D. */
  values: number[];
}

export interface TdResult {
  params: TdParams;
  trials: TdTrial[];
}

/** Validates (throws a ZodError on bad input) and runs the model. Deterministic for a given seed. */
export function simulateTd(input: TdParamsInput): TdResult {
  const params = tdParamsSchema.parse(input);
  const multipliers = stressMultipliers(params.stress);
  const alpha = params.alpha * multipliers.learningRate;
  const rewardSize = params.reward * multipliers.reward;
  const { gamma, delaySteps: d } = params;
  const random = mulberry32(params.seed);

  const values = new Array<number>(d).fill(0);
  const valueAt = (t: number): number => (t < 0 || t >= d ? 0 : (values[t] ?? 0));
  const trials: TdTrial[] = [];

  for (let n = 0; n < params.trials; n += 1) {
    const rewarded = params.rewardProbability >= 1 || random() < params.rewardProbability;
    const delta: number[] = [];
    for (let t = 0; t <= d; t += 1) {
      const r = t === d && rewarded ? rewardSize : 0;
      const error = r + gamma * valueAt(t) - valueAt(t - 1);
      delta.push(error);
      if (t >= 1) {
        values[t - 1] = valueAt(t - 1) + alpha * error;
      }
    }
    trials.push({ trial: n + 1, rewarded, delta, values: [...values] });
  }
  return { params, trials };
}

/** δ at cue onset and at reward time, per trial: the series that shows δ moving to the cue. */
export function cueAndRewardDeltas(
  result: TdResult,
): { trial: number; cue: number; reward: number }[] {
  const d = result.params.delaySteps;
  return result.trials.map((trial) => ({
    trial: trial.trial,
    cue: trial.delta[0] ?? 0,
    reward: trial.delta[d] ?? 0,
  }));
}
