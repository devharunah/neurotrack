"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getSessionUser } from "@/lib/auth";
import { saveExperiment } from "@/lib/experiments";
import { rwParamsSchema, simulateRescorlaWagner } from "@/lib/models/rescorla-wagner";
import { cueAndRewardDeltas, simulateTd, tdParamsSchema } from "@/lib/models/td-learning";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const saveInputSchema = z.union([
  z.object({ model: z.literal("rescorla-wagner"), params: rwParamsSchema }),
  z.object({ model: z.literal("td"), params: tdParamsSchema }),
]);

const round = (x: number): number => Math.round(x * 1e4) / 1e4;

/**
 * Saves a reward-learning run to `experiments` (module "neuro"). The browser computes the run
 * for display; the server re-validates the parameters and recomputes the summary, so what is
 * stored always matches the parameters.
 */
export async function saveRewardRunAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  if (!(await getSessionUser())) {
    return { ok: false, error: "You need to be signed in." };
  }
  const parsed = saveInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid parameters." };
  }

  const input = parsed.data;
  let saved: { id: string } | null;
  if (input.model === "rescorla-wagner") {
    const { params, trials } = simulateRescorlaWagner(input.params);
    saved = await saveExperiment({
      module: "neuro",
      kind: "rescorla-wagner",
      title: `Rescorla-Wagner, ${params.acquisitionTrials} acquisition + ${params.extinctionTrials} extinction trials`,
      config: params,
      result: {
        finalV: round(trials.at(-1)?.v ?? 0),
        rewardedTrials: trials.filter((t) => t.rewarded).length,
        v: trials.map((t) => round(t.v)),
      },
    });
  } else {
    const result = simulateTd(input.params);
    const series = cueAndRewardDeltas(result);
    saved = await saveExperiment({
      module: "neuro",
      kind: "td-learning",
      title: `TD(0), ${result.params.trials} trials, ${result.params.delaySteps}-step delay`,
      config: result.params,
      result: {
        finalValues: (result.trials.at(-1)?.values ?? []).map(round),
        deltaAtCue: series.map((s) => round(s.cue)),
        deltaAtReward: series.map((s) => round(s.reward)),
      },
    });
  }

  if (!saved) {
    return { ok: false, error: "Could not save the run." };
  }
  revalidatePath("/neuro/reward-learning");
  return { ok: true, data: saved };
}
