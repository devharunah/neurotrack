"use client";

import "./globals.css";

import { ErrorView } from "@/components/error-view";

// Replaces the root layout when it fails, so it renders its own <html> and <body>.
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <title>Something went wrong · NeuroTrack</title>
        <main className="px-4 py-16">
          <ErrorView error={error} retry={retry} />
        </main>
      </body>
    </html>
  );
}
