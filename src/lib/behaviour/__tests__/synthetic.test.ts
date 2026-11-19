import { DEFAULT_QUESTIONNAIRE } from "../schemas";
import {
  type SyntheticOptions,
  generateSyntheticData,
  observationHour,
  promptHours,
} from "../synthetic";

const NOW = new Date("2026-11-20T21:00:00Z");
const TZ = "Africa/Kampala";

const generate = (overrides: Partial<SyntheticOptions> = {}) =>
  generateSyntheticData({
    seed: 42,
    participants: 20,
    days: 30,
    promptsPerDay: 3,
    timeZone: TZ,
    questionnaire: DEFAULT_QUESTIONNAIRE,
    now: NOW,
    ...overrides,
  });

function ranks(values: number[]): number[] {
  const order = values.map((value, i) => ({ value, i })).sort((a, b) => a.value - b.value);
  const out = new Array<number>(values.length).fill(0);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1]?.value === order[i]?.value) {
      j++;
    }
    for (let k = i; k <= j; k++) {
      out[order[k]?.i ?? 0] = (i + j) / 2 + 1;
    }
    i = j + 1;
  }
  return out;
}

function spearman(x: number[], y: number[]): number {
  const rx = ranks(x);
  const ry = ranks(y);
  const mean = (rx.length + 1) / 2;
  let num = 0;
  let dx = 0;
  let dy = 0;
  rx.forEach((r, i) => {
    const a = r - mean;
    const b = (ry[i] ?? 0) - mean;
    num += a * b;
    dx += a * a;
    dy += b * b;
  });
  return num / Math.sqrt(dx * dy);
}

describe("generateSyntheticData", () => {
  it("is labelled synthetic and reproducible from its seed", () => {
    const a = generate();
    expect(a.synthetic).toBe(true);
    expect(generate()).toEqual(a);
    expect(generate({ seed: 43 })).not.toEqual(a);
  });

  it("makes unique S- pseudonyms that avoid ones already taken", () => {
    const names = generate().participants.map((p) => p.pseudonym);
    expect(new Set(names).size).toBe(20);
    for (const name of names) {
      expect(name).toMatch(/^S-[2-9A-HJ-NP-Z]{4}$/);
    }
    for (const p of generate({ taken: new Set(names) }).participants) {
      expect(names).not.toContain(p.pseudonym);
    }
  });

  it("stays in range, inside the window and below the schedule", () => {
    const { observations, participants } = generate();
    expect(observations.length).toBeGreaterThan(20 * 30 * 3 * 0.5);
    expect(observations.length).toBeLessThan(20 * 30 * 3);
    const start = Date.parse(participants[0]?.created_at ?? "");
    for (const o of observations) {
      for (const v of [o.mood, o.stress, o.sleep_quality, o.craving_intensity]) {
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(10);
      }
      const at = Date.parse(o.observed_at);
      expect(at).toBeLessThanOrEqual(NOW.getTime());
      expect(at).toBeGreaterThanOrEqual(start);
      expect(observationHour(o, TZ)).toBeGreaterThanOrEqual(6);
      expect(o.substance_use).toBeNull();
      expect(o.answers).toEqual({});
    }
  });

  it("builds in the documented associations", () => {
    const { observations } = generate({ participants: 40 });
    const craving = observations.map((o) => o.craving_intensity ?? 0);
    expect(
      spearman(
        observations.map((o) => o.stress ?? 0),
        craving,
      ),
    ).toBeGreaterThan(0.25);
    expect(
      spearman(
        observations.map((o) => o.sleep_quality ?? 0),
        craving,
      ),
    ).toBeLessThan(-0.1);
    expect(
      spearman(
        observations.map((o) => o.mood ?? 0),
        craving,
      ),
    ).toBeLessThan(-0.1);
    const average = (rows: typeof observations) =>
      rows.reduce((sum, o) => sum + (o.craving_intensity ?? 0), 0) / rows.length;
    const evening = observations.filter((o) => observationHour(o, TZ) >= 18);
    const daytime = observations.filter((o) => observationHour(o, TZ) < 18);
    expect(average(evening)).toBeGreaterThan(average(daytime));
  });

  it("respects the questionnaire: disabled fields stay null, voluntary ones are sometimes blank", () => {
    const { observations } = generate({
      questionnaire: {
        ...DEFAULT_QUESTIONNAIRE,
        fields: { ...DEFAULT_QUESTIONNAIRE.fields, mood: false, substance_use: true },
        custom: [{ id: "q_abcd", prompt: "Hours outside?", type: "scale" }],
      },
    });
    expect(observations.every((o) => o.mood === null)).toBe(true);
    const disclosed = observations.filter((o) => o.substance_use !== null).length;
    expect(disclosed).toBeGreaterThan(0);
    expect(disclosed).toBeLessThan(observations.length);
    expect(observations.every((o) => typeof o.answers["q_abcd"] === "number")).toBe(true);
  });

  it("spreads prompts across the waking day", () => {
    expect(promptHours(1)).toEqual([19]);
    expect(promptHours(3)).toEqual([8, 15, 22]);
  });
});
