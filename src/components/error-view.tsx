"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Shared fallback for error boundaries. Shows the error digest (a hash Next logs server-side)
 * so a report can be matched to the logs, but never the message or stack: in production, server
 * errors arrive here already redacted, and client errors could still carry internal details.
 */
export function ErrorView({
  error,
  retry,
  homeHref = "/",
}: {
  error: Error & { digest?: string };
  retry: () => void;
  homeHref?: "/" | "/dashboard";
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div
      role="alert"
      className="mx-auto max-w-xl space-y-4 rounded-2xl border border-line bg-card p-6"
    >
      <h1 className="text-xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="leading-7 text-ink-soft">
        The page hit an unexpected error. Your saved experiments are not affected. You can try
        again, and if it keeps happening, please report it with the reference below.
      </p>
      {error.digest ? (
        <p className="text-sm text-muted">
          Reference: <code className="font-mono">{error.digest}</code>
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => retry()}
          className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink-soft"
        >
          Try again
        </button>
        <Link
          href={homeHref}
          className="rounded-lg border border-line px-4 py-2 text-sm font-medium hover:border-ink-soft"
        >
          {homeHref === "/" ? "Go to the home page" : "Back to the dashboard"}
        </Link>
      </div>
    </div>
  );
}
