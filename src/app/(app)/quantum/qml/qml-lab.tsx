"use client";

import { useState, useTransition } from "react";

import type { QmlCompareResult } from "@/lib/api/client";

import { qmlCompareAction } from "../actions";

const DEFAULTS = { samples: 80, noise: 0.1, feature_map_reps: 2, feature_scale: 1, seed: 7 };

const FIELDS = [
  {
    key: "samples",
    label: "Samples",
    min: 20,
    max: 200,
    step: 10,
    help: "Size of the synthetic dataset.",
  },
  {
    key: "noise",
    label: "Label noise",
    min: 0,
    max: 0.5,
    step: 0.05,
    help: "Fraction of labels randomly flipped.",
  },
  {
    key: "feature_map_reps",
    label: "Feature-map repetitions",
    min: 1,
    max: 3,
    step: 1,
    help: "Depth of the ZZ feature map.",
  },
  {
    key: "feature_scale",
    label: "Feature scale (bandwidth)",
    min: 0.1,
    max: 3.1,
    step: 0.1,
    help: "Too high and the kernel memorises; too low and all points look alike.",
  },
  {
    key: "seed",
    label: "Random seed",
    min: 0,
    max: 99,
    step: 1,
    help: "Same seed, same dataset and split.",
  },
] as const;

export function QmlLab() {
  const [settings, setSettings] = useState(DEFAULTS);
  const [result, setResult] = useState<QmlCompareResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const execute = () => {
    setError(null);
    startTransition(async () => {
      const response = await qmlCompareAction(settings);
      if (response.ok) {
        setResult(response.data);
      } else {
        setError(response.error);
      }
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
      <section className="space-y-4 rounded-2xl border border-line bg-card p-5">
        <h2 className="font-semibold">Experiment settings</h2>
        {FIELDS.map((field) => (
          <label key={field.key} className="block text-sm">
            {field.label}: <span className="font-mono">{settings[field.key]}</span>
            <input
              type="range"
              min={field.min}
              max={field.max}
              step={field.step}
              value={settings[field.key]}
              onChange={(e) => setSettings({ ...settings, [field.key]: Number(e.target.value) })}
              className="mt-1 w-full accent-quantum"
            />
            <span className="text-xs text-muted">{field.help}</span>
          </label>
        ))}
        <button
          type="button"
          onClick={execute}
          disabled={pending}
          className="w-full rounded-lg bg-quantum px-4 py-2 font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Training models…" : "Run comparison"}
        </button>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
      </section>

      <section className="min-w-0 space-y-4">
        {!result ? (
          <div className="rounded-2xl border border-dashed border-line p-8 text-sm text-ink-soft">
            Run the comparison to train one quantum-kernel classifier and two classical baselines on
            the same synthetic data and the same train/test split.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-2xl border border-line bg-card">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Model</th>
                    <th className="px-4 py-3 font-medium">Accuracy</th>
                    <th className="px-4 py-3 font-medium">F1</th>
                    <th className="px-4 py-3 font-medium">Train</th>
                    <th className="px-4 py-3 font-medium">Predict</th>
                  </tr>
                </thead>
                <tbody>
                  {result.models.map((model) => (
                    <tr key={model.name} className="border-b border-line last:border-0">
                      <td className="px-4 py-3">
                        <span
                          className={`mr-2 rounded px-1.5 py-0.5 text-xs ${
                            model.family === "quantum"
                              ? "bg-quantum-soft text-quantum"
                              : "bg-paper text-ink-soft"
                          }`}
                        >
                          {model.family}
                        </span>
                        {model.name}
                        <p className="mt-1 text-xs text-muted">{model.notes}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-20 rounded bg-paper">
                            <div
                              className={`h-2 rounded ${model.family === "quantum" ? "bg-quantum" : "bg-ink-soft"}`}
                              style={{ width: `${model.accuracy * 100}%` }}
                            />
                          </div>
                          <span className="font-mono">{(model.accuracy * 100).toFixed(1)}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono">{model.f1.toFixed(2)}</td>
                      <td className="px-4 py-3 font-mono">{model.train_ms} ms</td>
                      <td className="px-4 py-3 font-mono">{model.predict_ms} ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              {[
                ["Qubits", result.quantum_resources["qubits"]],
                ["Feature-map depth", result.quantum_resources["circuit_depth"]],
                ["Kernel entries evaluated", result.quantum_resources["kernel_entries_evaluated"]],
                [
                  "Train / test",
                  `${String(result.dataset["train_size"])} / ${String(result.dataset["test_size"])}`,
                ],
                ["Positive rate", String(result.dataset["positive_rate"])],
                ["Data", "Synthetic"],
              ].map(([label, value]) => (
                <div
                  key={String(label)}
                  className="rounded-xl border border-line bg-card px-4 py-3"
                >
                  <dt className="text-muted">{label}</dt>
                  <dd className="mt-1 font-mono">{String(value)}</dd>
                </div>
              ))}
            </dl>
            <p
              role="note"
              className="rounded-lg border border-amber-200 bg-warn-soft px-4 py-3 text-sm text-warn"
            >
              {result.caveat}
            </p>
          </>
        )}
      </section>
    </div>
  );
}
