import type { Metadata } from "next";

import { QmlLab } from "./qml-lab";

export const metadata: Metadata = { title: "Quantum vs classical" };

export default function QmlPage() {
  return (
    <div className="max-w-7xl space-y-6">
      <header>
        <p className="text-sm font-medium text-quantum">QuantumLab</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Quantum vs classical classifiers
        </h1>
        <p className="mt-2 max-w-3xl leading-7 text-ink-soft">
          A quantum kernel maps each data point into a quantum state with a ZZ feature map, and
          measures similarity as the overlap between states. Here it classifies a small synthetic
          dataset (stress level and sleep quality → high reported craving), next to two classical
          baselines trained on exactly the same split.
        </p>
      </header>
      <QmlLab />
    </div>
  );
}
