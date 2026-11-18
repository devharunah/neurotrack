"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  ApiError,
  type QmlCompareResult,
  type RunRequest,
  type RunResult,
  api,
} from "@/lib/api/client";
import { getSessionUser } from "@/lib/auth";
import { saveExperiment } from "@/lib/experiments";
import { type RunInput, runInputSchema } from "@/lib/quantum/circuit";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface CircuitRun {
  ideal: RunResult;
  noisy: RunResult | null;
  saved: boolean;
}

function failure(error: unknown): { ok: false; error: string } {
  if (error instanceof ApiError) {
    return { ok: false, error: error.message };
  }
  return { ok: false, error: "Something went wrong running the experiment." };
}

function hasNoise(input: RunInput): boolean {
  const n = input.noise;
  return Boolean(n && (n.depolarizing_1q > 0 || n.depolarizing_2q > 0 || n.readout > 0));
}

export async function runCircuitAction(raw: unknown): Promise<ActionResult<CircuitRun>> {
  if (!(await getSessionUser())) {
    return { ok: false, error: "You need to be signed in." };
  }
  const parsed = runInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid circuit." };
  }

  const { num_qubits, gates, shots, seed, noise } = parsed.data;
  const idealRequest: RunRequest = {
    num_qubits,
    gates,
    shots,
    ...(seed === undefined ? {} : { seed }),
  };
  try {
    const [ideal, noisy] = await Promise.all([
      api.runCircuit(idealRequest),
      hasNoise(parsed.data) && noise
        ? api.runCircuit({ ...idealRequest, noise })
        : Promise.resolve(null),
    ]);
    const saved = await saveExperiment({
      module: "quantum",
      kind: "circuit",
      title: `${parsed.data.num_qubits}-qubit circuit, ${parsed.data.gates.length} gates`,
      config: parsed.data,
      result: { ideal: ideal.counts, noisy: noisy?.counts ?? null, depth: ideal.depth },
    });
    revalidatePath("/quantum");
    return { ok: true, data: { ideal, noisy, saved: saved !== null } };
  } catch (error) {
    return failure(error);
  }
}

const qmlInputSchema = z.object({
  samples: z.number().int().min(20).max(200),
  noise: z.number().min(0).max(0.5),
  feature_map_reps: z.number().int().min(1).max(3),
  feature_scale: z.number().min(0.1).max(Math.PI),
  seed: z.number().int().min(0),
});

export async function qmlCompareAction(raw: unknown): Promise<ActionResult<QmlCompareResult>> {
  if (!(await getSessionUser())) {
    return { ok: false, error: "You need to be signed in." };
  }
  const parsed = qmlInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid settings." };
  }
  try {
    const result = await api.qmlCompare(parsed.data);
    await saveExperiment({
      module: "quantum",
      kind: "qml-compare",
      title: "Quantum kernel vs classical baselines",
      config: parsed.data,
      result: { models: result.models, quantum_resources: result.quantum_resources },
    });
    return { ok: true, data: result };
  } catch (error) {
    return failure(error);
  }
}
