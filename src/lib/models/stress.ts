import { z } from "zod";

/**
 * HYPOTHETICAL stress modulation.
 *
 * This is a "what if" control for exploring the models, not an empirical relationship. Stress is
 * a unitless level s in [0, 1]. It multiplies one model parameter by
 *
 *     m(s) = 1 − STRESS_MAX_EFFECT · s
 *
 * so s = 0 leaves the model unchanged and s = 1 halves the chosen parameter. The target is either
 * reward sensitivity (the reward magnitude λ or r that the model sees) or the learning rate.
 * Neither the linear form, the direction nor the size of the effect is taken from data. See the
 * model cards in docs/models/.
 */
export const STRESS_MAX_EFFECT = 0.5;

export const STRESS_TARGETS = ["reward-sensitivity", "learning-rate"] as const;
export type StressTarget = (typeof STRESS_TARGETS)[number];

export const stressSchema = z.object({
  level: z.number().min(0).max(1).default(0),
  target: z.enum(STRESS_TARGETS).default("reward-sensitivity"),
});

export type Stress = z.output<typeof stressSchema>;

export const NO_STRESS: Stress = { level: 0, target: "reward-sensitivity" };

export function stressMultipliers(stress: Stress): { reward: number; learningRate: number } {
  const factor = 1 - STRESS_MAX_EFFECT * stress.level;
  return stress.target === "reward-sensitivity"
    ? { reward: factor, learningRate: 1 }
    : { reward: 1, learningRate: factor };
}
