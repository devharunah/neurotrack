import { z } from "zod";

import { mulberry32 } from "./prng";
import { NO_STRESS, stressMultipliers, stressSchema } from "./stress";

/**
 * Rescorla-Wagner model for a single cue (Rescorla & Wagner, 1972).
 *
 *     ΔV = α β (λ − V)
 *
 * V is the associative strength of the cue, α the cue salience, β the learning rate associated
 * with the outcome, and λ the maximum associative strength the outcome supports (the reward
 * magnitude on a rewarded trial, 0 on a non-rewarded or extinction trial).
 *
 * This is an abstract learning model. V and (λ − V) are model quantities, not measurements or
 * simulations of dopamine. See docs/models/rescorla-wagner.md.
 */

export const RW_MAX_TRIALS = 500;

export const rwParamsSchema = z
  .object({
    alpha: z.number().min(0).max(1),
    beta: z.number().min(0).max(1),
    lambda: z.number().min(0).max(2),
    acquisitionTrials: z.number().int().min(0).max(RW_MAX_TRIALS),
    extinctionTrials: z.number().int().min(0).max(RW_MAX_TRIALS),
    /** Probability that an acquisition trial is rewarded. 1 = continuous reinforcement. */
    rewardProbability: z.number().min(0).max(1).default(1),
    seed: z.number().int().min(0).max(0xffffffff).default(1),
    initialV: z.number().min(0).max(2).default(0),
    stress: stressSchema.default(NO_STRESS),
  })
  .refine((p) => p.acquisitionTrials + p.extinctionTrials >= 1, {
    message: "Run at least one trial.",
  })
  .refine((p) => p.acquisitionTrials + p.extinctionTrials <= RW_MAX_TRIALS, {
    message: `Run at most ${RW_MAX_TRIALS} trials in total.`,
  });

export type RwParamsInput = z.input<typeof rwParamsSchema>;
export type RwParams = z.output<typeof rwParamsSchema>;

export type Phase = "acquisition" | "extinction";

export interface RwTrial {
  /** 1-based trial number. */
  trial: number;
  phase: Phase;
  rewarded: boolean;
  /** λ the model saw on this trial, after any stress modulation. */
  lambda: number;
  /** Associative strength before the update. */
  vBefore: number;
  /** Prediction error λ − V. */
  error: number;
  /** Associative strength after the update. */
  v: number;
}

export interface RwResult {
  params: RwParams;
  trials: RwTrial[];
  /** Effective αβ after stress modulation. */
  effectiveRate: number;
}

/** Validates (throws a ZodError on bad input) and runs the model. Deterministic for a given seed. */
export function simulateRescorlaWagner(input: RwParamsInput): RwResult {
  const params = rwParamsSchema.parse(input);
  const multipliers = stressMultipliers(params.stress);
  const rate = params.alpha * params.beta * multipliers.learningRate;
  const rewardLambda = params.lambda * multipliers.reward;
  const random = mulberry32(params.seed);

  const trials: RwTrial[] = [];
  let v = params.initialV;
  const total = params.acquisitionTrials + params.extinctionTrials;
  for (let i = 0; i < total; i += 1) {
    const phase: Phase = i < params.acquisitionTrials ? "acquisition" : "extinction";
    // Draw only on acquisition trials, so extinction never consumes the random sequence.
    const rewarded =
      phase === "acquisition" &&
      (params.rewardProbability >= 1 || random() < params.rewardProbability);
    const lambda = rewarded ? rewardLambda : 0;
    const error = lambda - v;
    const next = v + rate * error;
    trials.push({ trial: i + 1, phase, rewarded, lambda, vBefore: v, error, v: next });
    v = next;
  }
  return { params, trials, effectiveRate: rate };
}
