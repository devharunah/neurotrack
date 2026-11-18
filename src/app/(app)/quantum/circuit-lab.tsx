"use client";

import { useState, useTransition } from "react";

import type { Preset } from "@/lib/api/client";
import {
  type Circuit,
  GATE_INFO,
  type GateOp,
  MAX_QUBITS,
  MAX_SHOTS,
  addGate,
  emptyCircuit,
  fromApiCircuit,
  removeGate,
  setQubitCount,
  toRunInput,
} from "@/lib/quantum/circuit";

import { type CircuitRun, runCircuitAction } from "./actions";
import { CircuitDiagram } from "./circuit-diagram";
import { Histogram } from "./histogram";

const TOOLS: GateOp[] = ["h", "x", "y", "z", "cx"];
const NO_NOISE = { depolarizing_1q: 0, depolarizing_2q: 0, readout: 0 };

export function CircuitLab({ presets }: { presets: Preset[] }) {
  const [circuit, setCircuit] = useState<Circuit>(emptyCircuit(2));
  const [tool, setTool] = useState<GateOp>("h");
  const [pendingControl, setPendingControl] = useState<number | null>(null);
  const [shots, setShots] = useState(1024);
  const [noise, setNoise] = useState(NO_NOISE);
  const [run, setRun] = useState<CircuitRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activePreset, setActivePreset] = useState<Preset | null>(null);
  const [pending, startTransition] = useTransition();

  const update = (next: Circuit) => {
    setCircuit(next);
    setRun(null);
  };

  const onQubitClick = (qubit: number) => {
    if (tool !== "cx") {
      update(addGate(circuit, { op: tool, target: qubit }));
      return;
    }
    if (pendingControl === null) {
      setPendingControl(qubit);
    } else if (pendingControl !== qubit) {
      update(addGate(circuit, { op: "cx", control: pendingControl, target: qubit }));
      setPendingControl(null);
    }
  };

  const loadPreset = (preset: Preset) => {
    setActivePreset(preset);
    setPendingControl(null);
    update(fromApiCircuit(preset.circuit));
  };

  const execute = () => {
    setError(null);
    startTransition(async () => {
      const result = await runCircuitAction(toRunInput(circuit, shots, noise));
      if (result.ok) {
        setRun(result.data);
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-6">
        <section className="rounded-2xl border border-line bg-card p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-sm font-medium">Gate</span>
            {TOOLS.map((op) => (
              <button
                key={op}
                type="button"
                onClick={() => {
                  setTool(op);
                  setPendingControl(null);
                }}
                aria-pressed={tool === op}
                title={GATE_INFO[op].description}
                className={`rounded-lg px-3 py-1.5 font-mono text-sm ${
                  tool === op ? "bg-quantum text-white" : "bg-quantum-soft text-quantum"
                }`}
              >
                {GATE_INFO[op].label}
              </button>
            ))}
            <span className="ml-auto flex items-center gap-2 text-sm">
              <label htmlFor="qubits">Qubits</label>
              <select
                id="qubits"
                value={circuit.numQubits}
                onChange={(e) => {
                  setPendingControl(null);
                  update(setQubitCount(circuit, Number(e.target.value)));
                }}
                className="rounded-md border border-line px-2 py-1"
              >
                {Array.from({ length: MAX_QUBITS }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </span>
          </div>
          <p className="mt-3 text-sm text-ink-soft" aria-live="polite">
            {tool === "cx"
              ? pendingControl === null
                ? "CNOT: click the control qubit, then the target qubit."
                : `CNOT: control is q${pendingControl}. Now click the target qubit.`
              : `${GATE_INFO[tool].description} Click a qubit label to place it. Click a gate to remove it.`}
          </p>
          <div className="mt-4">
            <CircuitDiagram
              circuit={circuit}
              pendingControl={pendingControl}
              onQubitClick={onQubitClick}
              onGateClick={(index) => update(removeGate(circuit, index))}
            />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={execute}
              disabled={pending}
              className="rounded-lg bg-quantum px-5 py-2 font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              {pending ? "Running…" : "Run on simulator"}
            </button>
            <button
              type="button"
              onClick={() => {
                setActivePreset(null);
                setPendingControl(null);
                update(emptyCircuit(circuit.numQubits));
              }}
              className="rounded-lg border border-line px-4 py-2 text-sm hover:border-ink-soft"
            >
              Clear
            </button>
            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            )}
          </div>
        </section>

        {run && (
          <section
            className="space-y-4 rounded-2xl border border-line bg-card p-5"
            aria-label="Results"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">Measurement results</h2>
              <p className="text-xs text-muted">
                {run.ideal.shots} shots · depth {run.ideal.depth} · {run.ideal.elapsed_ms} ms ·{" "}
                {run.saved ? "saved to history" : "not saved"}
              </p>
            </div>
            <Histogram
              numQubits={circuit.numQubits}
              ideal={run.ideal.probabilities}
              noisy={run.noisy?.probabilities ?? null}
            />
            <p className="text-xs text-muted">{run.ideal.bit_order}.</p>
            {run.ideal.statevector && (
              <details>
                <summary className="cursor-pointer text-sm font-medium">
                  Statevector (exact amplitudes)
                </summary>
                <table className="mt-2 w-full max-w-md text-left font-mono text-xs">
                  <thead className="text-muted">
                    <tr>
                      <th className="py-1">|basis⟩</th>
                      <th>amplitude</th>
                      <th>probability</th>
                    </tr>
                  </thead>
                  <tbody>
                    {run.ideal.statevector.map((a) => (
                      <tr key={a.basis} className="border-t border-line">
                        <td className="py-1">|{a.basis}⟩</td>
                        <td>
                          {a.re.toFixed(3)} {a.im < 0 ? "−" : "+"} {Math.abs(a.im).toFixed(3)}i
                        </td>
                        <td>{(a.probability * 100).toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            )}
            <details>
              <summary className="cursor-pointer text-sm font-medium">
                Qiskit circuit (text)
              </summary>
              <pre className="mt-2 overflow-x-auto rounded-lg bg-paper p-3 text-xs leading-5">
                {run.ideal.diagram}
              </pre>
            </details>
          </section>
        )}
      </div>

      <aside className="space-y-6">
        <section className="rounded-2xl border border-line bg-card p-5">
          <h2 className="font-semibold">Guided experiments</h2>
          <div className="mt-3 space-y-2">
            {presets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => loadPreset(preset)}
                className={`block w-full rounded-lg border px-3 py-2 text-left text-sm ${
                  activePreset?.id === preset.id
                    ? "border-quantum bg-quantum-soft"
                    : "border-line hover:border-ink-soft"
                }`}
              >
                {preset.name}
              </button>
            ))}
          </div>
          {activePreset && (
            <p className="mt-3 text-sm leading-6 text-ink-soft">{activePreset.description}</p>
          )}
        </section>

        <section className="space-y-4 rounded-2xl border border-line bg-card p-5">
          <h2 className="font-semibold">Simulation</h2>
          <label className="block text-sm">
            Shots: <span className="font-mono">{shots}</span>
            <input
              type="range"
              min={64}
              max={MAX_SHOTS}
              step={64}
              value={shots}
              onChange={(e) => setShots(Number(e.target.value))}
              className="mt-1 w-full accent-quantum"
            />
          </label>
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Noise model (compared against ideal)</legend>
            {(
              [
                ["depolarizing_1q", "1-qubit gate error"],
                ["depolarizing_2q", "CNOT error"],
                ["readout", "Readout error"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block text-sm">
                {label}: <span className="font-mono">{(noise[key] * 100).toFixed(0)}%</span>
                <input
                  type="range"
                  min={0}
                  max={0.3}
                  step={0.01}
                  value={noise[key]}
                  onChange={(e) => setNoise({ ...noise, [key]: Number(e.target.value) })}
                  className="mt-1 w-full accent-amber-500"
                />
              </label>
            ))}
          </fieldset>
          <p className="text-xs leading-5 text-muted">
            Runs locally on Qiskit Aer. Noise is a simple depolarizing + readout model, not a model
            of any specific quantum computer.
          </p>
        </section>
      </aside>
    </div>
  );
}
