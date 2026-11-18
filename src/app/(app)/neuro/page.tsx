import type { Metadata } from "next";
import Link from "next/link";

import { Disclaimer } from "@/components/disclaimer";

import { BrainExplorer } from "./brain-explorer";

export const metadata: Metadata = { title: "NeuroLab" };

export default function NeuroLabPage() {
  return (
    <div className="max-w-7xl space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">NeuroLab</h1>
          <p className="mt-2 max-w-3xl leading-7 text-ink-soft">
            Explore six brain regions that research on reward, learning and addiction returns to
            again and again. Select a region for a short summary, then open its page for the
            anatomy, its role in learning and the reviews the text is drawn from.
          </p>
        </div>
        <Link
          href="/neuro/reward-learning"
          className="rounded-lg bg-neuro px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Open the reward-learning simulator
        </Link>
      </header>

      <BrainExplorer />

      <Disclaimer>
        The 3D brain is a simplified teaching model, not an anatomical atlas or a scan. Region
        summaries describe research findings and say nothing about any individual.
      </Disclaimer>
    </div>
  );
}
