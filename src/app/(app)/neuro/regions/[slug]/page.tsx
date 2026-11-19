import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Disclaimer } from "@/components/disclaimer";
import {
  BRAIN_REGIONS,
  doiUrl,
  formatReference,
  getBrainRegion,
  pubmedUrl,
} from "@/lib/content/brain-regions";

export function generateStaticParams(): { slug: string }[] {
  return BRAIN_REGIONS.map((region) => ({ slug: region.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/neuro/regions/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const region = getBrainRegion(slug);
  return { title: region ? `${region.name} · NeuroLab` : "Region not found" };
}

export default async function RegionPage({ params }: PageProps<"/neuro/regions/[slug]">) {
  const { slug } = await params;
  const region = getBrainRegion(slug);
  if (!region) {
    notFound();
  }

  const index = BRAIN_REGIONS.indexOf(region);
  const previous = BRAIN_REGIONS[(index - 1 + BRAIN_REGIONS.length) % BRAIN_REGIONS.length];
  const next = BRAIN_REGIONS[(index + 1) % BRAIN_REGIONS.length];

  return (
    <article className="max-w-3xl space-y-8">
      <header>
        <Link href="/neuro" className="text-sm font-medium text-neuro hover:underline">
          ← NeuroLab brain explorer
        </Link>
        <div className="mt-3 flex items-center gap-3">
          <span
            aria-hidden="true"
            className="size-4 shrink-0 rounded-full"
            style={{ backgroundColor: region.explorer.color }}
          />
          <h1 className="text-2xl font-semibold tracking-tight">{region.name}</h1>
          <span className="rounded bg-neuro-soft px-2 py-0.5 font-mono text-xs text-neuro">
            {region.abbreviation}
          </span>
        </div>
      </header>

      <section aria-labelledby="anatomy">
        <h2 id="anatomy" className="text-lg font-semibold">
          Anatomy
        </h2>
        <p className="mt-2 leading-7 text-ink-soft">{region.anatomy}</p>
      </section>

      <section aria-labelledby="functions">
        <h2 id="functions" className="text-lg font-semibold">
          Primary functions
        </h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 leading-7 text-ink-soft">
          {region.primaryFunctions.map((fn) => (
            <li key={fn}>{fn}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="reward">
        <h2 id="reward" className="text-lg font-semibold">
          Reward and learning
        </h2>
        <p className="mt-2 leading-7 text-ink-soft">{region.rewardAndLearning}</p>
      </section>

      <section aria-labelledby="addiction">
        <h2 id="addiction" className="text-lg font-semibold">
          In addiction research
        </h2>
        <p className="mt-2 leading-7 text-ink-soft">{region.addictionResearch}</p>
      </section>

      <section aria-labelledby="references" className="rounded-2xl border border-line bg-card p-5">
        <h2 id="references" className="font-semibold">
          References
        </h2>
        <ol className="mt-3 list-decimal space-y-3 pl-5 text-sm leading-6 text-ink-soft">
          {region.references.map((ref) => (
            <li key={ref.doi}>
              {formatReference(ref)}{" "}
              <a
                href={doiUrl(ref.doi)}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all text-accent hover:underline"
              >
                doi:{ref.doi}
              </a>
              {ref.pmid && (
                <>
                  {" · "}
                  <a
                    href={pubmedUrl(ref.pmid)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:underline"
                  >
                    PubMed {ref.pmid}
                  </a>
                </>
              )}
            </li>
          ))}
        </ol>
      </section>

      <nav aria-label="Other regions" className="flex flex-wrap justify-between gap-3 text-sm">
        {previous && (
          <Link href={`/neuro/regions/${previous.slug}`} className="text-neuro hover:underline">
            ← {previous.name}
          </Link>
        )}
        <Link href="/neuro/reward-learning" className="text-neuro hover:underline">
          Reward-learning simulator
        </Link>
        {next && (
          <Link href={`/neuro/regions/${next.slug}`} className="text-neuro hover:underline">
            {next.name} →
          </Link>
        )}
      </nav>

      <Disclaimer>
        Region summaries are simplified for learning and are drawn from the cited reviews. They
        describe research findings, not anything about an individual.
      </Disclaimer>
    </article>
  );
}
