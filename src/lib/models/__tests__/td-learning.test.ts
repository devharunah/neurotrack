import { type TdParamsInput, cueAndRewardDeltas, simulateTd, tdParamsSchema } from "../td-learning";

const BASE: TdParamsInput = { alpha: 0.3, gamma: 1, reward: 1, delaySteps: 5, trials: 150 };

describe("TD(0) learning", () => {
  it("returns δ for every step and a value per state", () => {
    const { trials } = simulateTd(BASE);
    expect(trials).toHaveLength(150);
    for (const trial of trials) {
      expect(trial.delta).toHaveLength(6);
      expect(trial.values).toHaveLength(5);
    }
  });

  it("starts with δ at reward time only", () => {
    const first = simulateTd(BASE).trials[0];
    expect(first?.delta.slice(0, 5)).toEqual([0, 0, 0, 0, 0]);
    expect(first?.delta[5]).toBe(1);
  });

  it("moves δ from reward time to cue time as learning proceeds", () => {
    const series = cueAndRewardDeltas(simulateTd(BASE));
    const first = series[0];
    const last = series.at(-1);
    expect(first?.reward).toBe(1);
    expect(first?.cue).toBe(0);
    expect(last?.cue).toBeCloseTo(1, 3);
    expect(last?.reward).toBeCloseTo(0, 3);

    // Monotone: δ at the cue never falls, δ at reward never rises (continuous reward).
    for (let i = 1; i < series.length; i += 1) {
      expect(series[i]?.cue ?? Number.NaN).toBeGreaterThanOrEqual(
        (series[i - 1]?.cue ?? Number.NaN) - 1e-12,
      );
      expect(series[i]?.reward ?? Number.NaN).toBeLessThanOrEqual(
        (series[i - 1]?.reward ?? Number.NaN) + 1e-12,
      );
    }
  });

  it("learns discounted values V(t) → γ^(D−1−t) r", () => {
    const { trials } = simulateTd({ ...BASE, gamma: 0.9, trials: 400 });
    const values = trials.at(-1)?.values ?? [];
    values.forEach((v, t) => {
      expect(v).toBeCloseTo(0.9 ** (5 - 1 - t), 3);
    });
    expect(trials.at(-1)?.delta[0]).toBeCloseTo(0.9 ** 5, 3);
  });

  it("does not learn when α is 0", () => {
    const { trials } = simulateTd({ ...BASE, alpha: 0 });
    expect(trials.at(-1)?.values.every((v) => v === 0)).toBe(true);
    expect(trials.at(-1)?.delta[5]).toBe(1);
  });

  it("dips below zero when a predicted reward is omitted", () => {
    const { trials } = simulateTd({ ...BASE, trials: 300, rewardProbability: 0.8, seed: 5 });
    const omitted = trials.slice(100).find((t) => !t.rewarded);
    expect(omitted).toBeDefined();
    expect(omitted?.delta[5] ?? 0).toBeLessThan(0);
  });

  it("is deterministic for a seed", () => {
    const input = { ...BASE, rewardProbability: 0.5, seed: 11 };
    expect(simulateTd(input)).toEqual(simulateTd(input));
  });

  it("scales the reward under hypothetical stress on reward sensitivity", () => {
    const { trials } = simulateTd({ ...BASE, stress: { level: 1, target: "reward-sensitivity" } });
    expect(trials[0]?.delta[5]).toBeCloseTo(0.5, 12);
  });

  it("rejects invalid inputs", () => {
    expect(tdParamsSchema.safeParse({ ...BASE, gamma: 1.2 }).success).toBe(false);
    expect(tdParamsSchema.safeParse({ ...BASE, delaySteps: 0 }).success).toBe(false);
    expect(tdParamsSchema.safeParse({ ...BASE, delaySteps: 21 }).success).toBe(false);
    expect(tdParamsSchema.safeParse({ ...BASE, trials: 501 }).success).toBe(false);
    expect(tdParamsSchema.safeParse({ ...BASE, stress: { target: "mood" } }).success).toBe(false);
    expect(() => simulateTd({ ...BASE, alpha: -1 })).toThrow();
  });
});
