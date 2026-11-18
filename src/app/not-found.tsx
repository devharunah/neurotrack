import type { Metadata } from "next";

import { NotFoundView } from "@/components/not-found-view";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="px-4 py-16">
      <NotFoundView />
    </main>
  );
}
