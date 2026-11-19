import Link from "next/link";

export function NotFoundView({ homeHref = "/" }: { homeHref?: "/" | "/dashboard" }) {
  return (
    <div className="mx-auto max-w-xl space-y-4 rounded-2xl border border-line bg-card p-6">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">404</p>
      <h1 className="text-xl font-semibold tracking-tight">Page not found</h1>
      <p className="leading-7 text-ink-soft">
        This page does not exist, or it belongs to someone else and you cannot see it.
      </p>
      <Link
        href={homeHref}
        className="inline-block rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink-soft"
      >
        {homeHref === "/" ? "Go to the home page" : "Back to the dashboard"}
      </Link>
    </div>
  );
}
