import { mulberry32 } from "../prng";
import { type RwParamsInput, rwParamsSchema, simulateRescorlaWagner } from "../rescorla-wagner";
import { STRESS_MAX_EFFECT } from "../stress";

const BASE: RwParamsInput = {
  alpha: 0.5,
  beta: 0.4,
  lambda: 1,
  acquisitionTrials: 100,
  extinctionTrials: 0,
};

const lastV = (input: RwParamsInput): number =>
  simulateRescorlaWagner(input).trials.at(-1)?.v ?? Number.NaN;

describe("mulberry32", () => {
  it("is deterministic and in [0, 1)", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const xs = Array.from({ length: 1000 }, () => a());
    expect(Array.from({ length: 1000 }, () => b())).toEqual(xs);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
    expect(mulberry32(43)()).not.toBe(xs[0]);
  });
});

describe("Rescorla-Wagner", () => {
  it("converges to λ under continuous reinforcement", () => {
    expect(lastV(BASE)).toBeCloseTo(1, 6);
    expect(lastV({ ...BASE, lambda: 1.6 })).toBeCloseTo(1.6, 6);
  });

  it("follows the closed form V_n = λ(1 − (1 − αβ)^n)", () => {
    const { trials } = simulateRescorlaWagner({ ...BASE, acquisitionTrials: 10 });
    trials.forEach((t, i) => {
      expect(t.v).toBeCloseTo(1 - (1 - 0.2) ** (i + 1), 12);
    });
  });

  it("does not learn when α or β is 0", () => {
    expect(lastV({ ...BASE, alpha: 0 })).toBe(0);
    expect(lastV({ ...BASE, beta: 0 })).toBe(0);
    expect(lastV({ ...BASE, alpha: 0, initialV: 0.7 })).toBe(0.7);
  });

  it("decays V towards 0 during extinction", () => {
    const { trials } = simulateRescorlaWagner({ ...BASE, extinctionTrials: 80 });
    const extinction = trials.filter((t) => t.phase === "extinction");
    expect(extinction).toHaveLength(80);
    expect(extinction.every((t) => t.lambda === 0 && !t.rewarded)).toBe(true);
    for (let i = 1; i < extinction.length; i += 1) {
      expect(extinction[i]?.v ?? Number.NaN).toBeLessThan(extinction[i - 1]?.v ?? Number.NaN);
    }
    expect(extinction.at(-1)?.v).toBeCloseTo(0, 6);
  });

  it("is deterministic for a seed under partial reinforcement", () => {
    const partial = { ...BASE, acquisitionTrials: 200, rewardProbability: 0.5, seed: 7 };
    expect(simulateRescorlaWagner(partial)).toEqual(simulateRescorlaWagner(partial));
    const other = simulateRescorlaWagner({ ...partial, seed: 8 }).trials.map((t) => t.rewarded);
    expect(simulateRescorlaWagner(partial).trials.map((t) => t.rewarded)).not.toEqual(other);
  });

  it("hovers around pλ under partial reinforcement", () => {
    const { trials } = simulateRescorlaWagner({
      ...BASE,
      alpha: 0.2,
      beta: 0.2,
      acquisitionTrials: 500,
      rewardProbability: 0.5,
      seed: 3,
    });
    const rate = trials.filter((t) => t.rewarded).length / trials.length;
    expect(rate).toBeGreaterThan(0.43);
    expect(rate).toBeLessThan(0.57);
    const late = trials.slice(250);
    const mean = late.reduce((sum, t) => sum + t.v, 0) / late.length;
    expect(mean).toBeGreaterThan(0.4);
    expect(mean).toBeLessThan(0.6);
  });

  it("applies the hypothetical stress modulation to the chosen parameter", () => {
    const reward = simulateRescorlaWagner({
      ...BASE,
      stress: { level: 1, target: "reward-sensitivity" },
    });
    expect(reward.trials.at(-1)?.v).toBeCloseTo(1 - STRESS_MAX_EFFECT, 6);
    expect(reward.effectiveRate).toBeCloseTo(0.2, 12);

    const rate = simulateRescorlaWagner({ ...BASE, stress: { level: 1, target: "learning-rate" } });
    expect(rate.effectiveRate).toBeCloseTo(0.2 * (1 - STRESS_MAX_EFFECT), 12);
    expect(rate.trials.at(-1)?.v).toBeCloseTo(1, 4);
  });

  it("rejects invalid inputs", () => {
    expect(rwParamsSchema.safeParse({ ...BASE, alpha: 1.5 }).success).toBe(false);
    expect(rwParamsSchema.safeParse({ ...BASE, beta: -0.1 }).success).toBe(false);
    expect(rwParamsSchema.safeParse({ ...BASE, rewardProbability: 2 }).success).toBe(false);
    expect(rwParamsSchema.safeParse({ ...BASE, acquisitionTrials: 1.5 }).success).toBe(false);
    expect(rwParamsSchema.safeParse({ ...BASE, acquisitionTrials: 0 }).success).toBe(false);
    expect(
      rwParamsSchema.safeParse({ ...BASE, acquisitionTrials: 400, extinctionTrials: 200 }).success,
    ).toBe(false);
    expect(rwParamsSchema.safeParse({ ...BASE, stress: { level: 3 } }).success).toBe(false);
    expect(() => simulateRescorlaWagner({ ...BASE, lambda: Number.NaN })).toThrow();
  });
});
