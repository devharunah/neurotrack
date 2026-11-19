import type { Metadata } from "next";
import Link from "next/link";

import { Disclaimer } from "@/components/disclaimer";
import { requireUser } from "@/lib/auth";
import { normaliseQuery, parseMode } from "@/lib/research/query";
import { listRecentQueries } from "@/lib/research/server";

import { EvidenceLegend } from "./ui";
import { ResearchWorkbench } from "./workbench";

export const metadata: Metadata = { title: "Research Assistant" };

export default async function ResearchPage({ searchParams }: PageProps<"/research">) {
  await requireUser();
  const params = await searchParams;
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const mode = parseMode(first(params["mode"]));
  const query = normaliseQuery(first(params["q"]) ?? "").slice(0, 300);
  const history = await listRecentQueries();

  return (
    <div className="max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-accent">Research Assistant</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Literature</h1>
          <p className="mt-2 max-w-3xl leading-7 text-ink-soft">
            Search Europe PMC and PubMed, or ask a question and get an answer assembled only from
            retrieved abstracts. Every <span className="font-mono">[n]</span> marker points to a
            publication that was actually retrieved; the server removes any sentence it cannot tie
            to one. No AI service is needed.
          </p>
        </div>
        <Link
          href="/research/saved"
          className="rounded-lg border border-line bg-white px-4 py-2 text-sm font-medium hover:bg-paper"
        >
          Saved references
        </Link>
      </header>

      <Disclaimer>
        Answers summarise a small sample of abstracts. They are not systematic reviews, not medical
        advice, and say nothing about any individual. Read the original publications.
      </Disclaimer>

      <ResearchWorkbench
        initialMode={mode}
        initialQuery={query}
        history={history.map(({ id, query: text, mode: entryMode }) => ({
          id,
          query: text,
          mode: entryMode,
        }))}
      />

      <EvidenceLegend />
    </div>
  );
}
