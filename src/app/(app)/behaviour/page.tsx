import type { Metadata } from "next";

import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "BehaviourLab" };

export default function BehaviourLabPage() {
  return (
    <ComingSoon
      title="BehaviourLab"
      milestone="Milestone 3"
      summary="Structured, consented research into how stress, sleep, mood and context relate to reported cravings. Synthetic data only until ethical approval is in place."
      features={[
        "Study creation, questionnaire builder and observation schedules",
        "Explicit, versioned consent and pseudonymous participant identifiers",
        "Trend, distribution and missing-observation dashboards",
        "Association analysis with confidence intervals; correlation is never presented as causation",
        "Researcher-only, audit-logged CSV export",
      ]}
    />
  );
}
