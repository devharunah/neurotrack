import type { Metadata } from "next";

import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "NeuroLab" };

export default function NeuroLabPage() {
  return (
    <ComingSoon
      title="NeuroLab"
      milestone="Milestone 2"
      summary="Explore the brain regions involved in reward and learning, and experiment with established computational models of reward learning."
      features={[
        "Interactive 3D brain: prefrontal cortex, amygdala, nucleus accumbens, basal ganglia, hippocampus, ventral tegmental area",
        "Region pages: anatomy, function, role in reward learning, cited addiction research",
        "Reward-learning explorer: Rescorla-Wagner and temporal-difference models with live parameter sliders",
        "Model cards documenting assumptions, parameters, limitations and references",
      ]}
    />
  );
}
