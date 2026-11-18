import type { Metadata } from "next";
import Link from "next/link";

import { Disclaimer } from "@/components/disclaimer";
import { listExperiments } from "@/lib/experiments";

export const metadata: Metadata = { title: "Dashboard" };

const MODULES = [
  {
    href: "/quantum",
    name: "QuantumLab",
    status: "Available",
    body: "Build circuits, run them on Qiskit Aer, add noise.",
  },
  {
    href: "/quantum/qml",
    name: "Quantum vs classical",
    status: "Available",
    body: "Quantum-kernel SVC against classical baselines on synthetic data.",
  },
  {
    href: "/neuro",
    name: "NeuroLab",
    status: "Next milestone",
    body: "3D brain explorer and reward-learning models.",
  },
  {
    href: "/behaviour",
    name: "BehaviourLab",
    status: "Planned",
    body: "Consented observation studies and trend analytics.",
  },
  {
    href: "/research",
    name: "Research Assistant",
    status: "Planned",
    body: "Citation-grounded literature search via Europe PMC and PubMed.",
  },
] as const;

export default async function DashboardPage() {
  const recent = await listExperiments(undefined, 8);

  return (
    <div className="max-w-5xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-ink-soft">Pick a lab to start experimenting.</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MODULES.map((module) => (
          <Link
            key={module.href}
            href={module.href}
            className="rounded-2xl border border-line bg-card p-5 hover:border-ink-soft"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">{module.name}</h2>
              <span className="text-xs text-muted">{module.status}</span>
            </div>
            <p className="mt-2 text-sm leading-6 text-ink-soft">{module.body}</p>
          </Link>
        ))}
      </div>

      <section>
        <h2 className="text-lg font-semibold">Recent experiments</h2>
        {recent.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">
            No experiments yet. Run a circuit in QuantumLab and it will appear here.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-card">
            {recent.map((row) => (
              <li key={row.id} className="flex justify-between gap-4 px-4 py-3 text-sm">
                <span>
                  <span className="font-medium">{row.title ?? row.kind}</span>{" "}
                  <span className="text-muted">· {row.module}</span>
                </span>
                <time className="text-muted" dateTime={row.created_at}>
                  {new Date(row.created_at).toLocaleString()}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Disclaimer />
    </div>
  );
}
