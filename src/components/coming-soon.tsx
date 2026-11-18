import { Disclaimer } from "@/components/disclaimer";

export function ComingSoon({
  title,
  milestone,
  summary,
  features,
}: {
  title: string;
  milestone: string;
  summary: string;
  features: readonly string[];
}) {
  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <p className="text-sm font-medium text-muted">{milestone}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 leading-7 text-ink-soft">{summary}</p>
      </header>
      <section className="rounded-2xl border border-line bg-card p-6">
        <h2 className="font-semibold">Planned</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-6 text-ink-soft">
          {features.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
      </section>
      <Disclaimer />
    </div>
  );
}
