import type { Metadata } from "next";

import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Research Assistant" };

export default function ResearchPage() {
  return (
    <ComingSoon
      title="Research Assistant"
      milestone="Milestone 4"
      summary="Search and understand the scientific literature, with every answer tied to a real, retrievable publication."
      features={[
        "Search Europe PMC and PubMed; cache abstracts and metadata",
        "Links to every original publication",
        "Optional local-model summaries; search works with no AI provider at all",
        "Citations validated against what was actually retrieved; nothing invented",
        "Distinguishes established findings, emerging evidence and open questions",
      ]}
    />
  );
}
