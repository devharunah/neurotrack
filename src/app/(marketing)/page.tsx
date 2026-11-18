import Link from "next/link";

import { Disclaimer } from "@/components/disclaimer";

const LABS = [
  {
    name: "NeuroLab",
    tone: "text-neuro bg-neuro-soft",
    summary:
      "Explore the brain regions involved in reward and addiction, then experiment with reward-learning models.",
    points: [
      "Interactive 3D brain explorer",
      "Rescorla-Wagner and temporal-difference models",
      "Every claim linked to a publication",
    ],
  },
  {
    name: "BehaviourLab",
    tone: "text-behaviour bg-behaviour-soft",
    summary:
      "Run consented studies on how stress, sleep and context relate to reported cravings over time.",
    points: [
      "Configurable observation questionnaires",
      "Trend and association dashboards",
      "Pseudonymous, exportable research data",
    ],
  },
  {
    name: "QuantumLab",
    tone: "text-quantum bg-quantum-soft",
    summary:
      "Build quantum circuits, run them on a local Qiskit simulator and compare quantum and classical models honestly.",
    points: [
      "Circuit builder with X, Y, Z, H and CNOT",
      "Noise models and measurement histograms",
      "Quantum-kernel vs classical baselines",
    ],
  },
] as const;

const PRINCIPLES = [
  ["Evidence first", "Models document their assumptions, parameters, limitations and references."],
  ["Correlation is not causation", "Behavioural analytics report associations, never diagnoses."],
  [
    "No hype",
    "Quantum results are compared against classical baselines. No advantage is claimed without evidence.",
  ],
  ["Privacy by default", "Consent, pseudonymous identifiers and row-level security from day one."],
] as const;

export default function Home() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <span className="text-lg font-semibold tracking-tight">NeuroTrack</span>
        <nav className="flex items-center gap-3 text-sm">
          <a
            href="https://github.com/devharunah/neurotrack"
            className="text-ink-soft hover:text-ink"
          >
            GitHub
          </a>
          <Link
            href="/login"
            className="rounded-lg bg-ink px-4 py-2 font-medium text-white hover:bg-ink-soft"
          >
            Sign in
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        <section className="py-16 sm:py-24">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">
            Open-source research platform
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            Explore the science behind the brain, human behaviour and quantum computing.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-ink-soft">
            NeuroTrack brings addiction neuroscience, behavioural research and experimental quantum
            computing into one place for researchers, clinicians-in-training and students.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/signup"
              className="rounded-lg bg-accent px-5 py-3 font-medium text-white hover:opacity-90"
            >
              Create a free account
            </Link>
            <Link
              href="/quantum"
              className="rounded-lg border border-line bg-card px-5 py-3 font-medium hover:border-ink-soft"
            >
              Open QuantumLab
            </Link>
          </div>
        </section>

        <section aria-labelledby="labs" className="pb-16">
          <h2 id="labs" className="text-2xl font-semibold tracking-tight">
            Three connected labs
          </h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {LABS.map((lab) => (
              <article key={lab.name} className="rounded-2xl border border-line bg-card p-6">
                <span className={`rounded-md px-2 py-1 text-xs font-semibold ${lab.tone}`}>
                  {lab.name}
                </span>
                <p className="mt-4 leading-7 text-ink-soft">{lab.summary}</p>
                <ul className="mt-4 space-y-2 text-sm">
                  {lab.points.map((point) => (
                    <li key={point} className="flex gap-2">
                      <span aria-hidden className="text-accent">
                        ✓
                      </span>
                      {point}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="principles" className="pb-16">
          <h2 id="principles" className="text-2xl font-semibold tracking-tight">
            Scientific integrity, built in
          </h2>
          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            {PRINCIPLES.map(([title, body]) => (
              <div key={title} className="rounded-2xl border border-line bg-card p-6">
                <dt className="font-semibold">{title}</dt>
                <dd className="mt-2 leading-7 text-ink-soft">{body}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="pb-16">
          <Disclaimer />
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-2 px-4 py-6 text-sm text-muted sm:px-6">
          <span>NeuroTrack: exploring the science behind the brain and human behaviour.</span>
          <span>MIT licensed · Runs locally · No paid services required</span>
        </div>
      </footer>
    </div>
  );
}
