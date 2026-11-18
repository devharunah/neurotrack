import type { Metadata } from "next";

import { Disclaimer } from "@/components/disclaimer";
import { ApiError, type Preset, api } from "@/lib/api/client";
import { listExperiments } from "@/lib/experiments";

import { CircuitLab } from "./circuit-lab";

export const metadata: Metadata = { title: "QuantumLab" };

async function loadPresets(): Promise<{ presets: Preset[]; error: string | null }> {
  try {
    return { presets: await api.presets(), error: null };
  } catch (error) {
    return {
      presets: [],
      error: error instanceof ApiError ? error.message : "Could not load presets.",
    };
  }
}

export default async function QuantumLabPage() {
  const [{ presets, error }, history] = await Promise.all([
    loadPresets(),
    listExperiments("quantum", 8),
  ]);

  return (
    <div className="max-w-7xl space-y-6">
      <header>
        <p className="text-sm font-medium text-quantum">QuantumLab</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Circuit builder</h1>
        <p className="mt-2 max-w-3xl leading-7 text-ink-soft">
          Place gates on qubits, run the circuit on a local Qiskit Aer simulator and inspect the
          measurement distribution. Start with the Bell state to see entanglement.
        </p>
      </header>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}

      <CircuitLab presets={presets} />

      <section>
        <h2 className="text-lg font-semibold">Your recent runs</h2>
        {history.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">No runs yet.</p>
        ) : (
          <ul
            className="mt-3 divide-y divide-line rounded-2xl border border-line bg-card"
            data-testid="run-history"
          >
            {history.map((row) => (
              <li key={row.id} className="flex justify-between gap-4 px-4 py-3 text-sm">
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
        Quantum simulations here are for learning. They are not connected to any behavioural or
        health data.
      </Disclaimer>
    </div>
  );
}
