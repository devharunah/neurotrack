"use client";

import { ErrorView } from "@/components/error-view";

export default function RootSegmentError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="px-4 py-16">
      <ErrorView error={error} retry={retry} />
    </main>
  );
}
