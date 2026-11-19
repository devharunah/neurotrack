import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { listSavedReferences } from "@/lib/research/server";

import { EmptyState, ErrorNote, EvidenceLegend } from "../ui";
import { SavedList } from "./saved-list";

export const metadata: Metadata = { title: "Saved references" };

export default async function SavedReferencesPage() {
  await requireUser();
  const saved = await listSavedReferences();

  return (
    <div className="max-w-4xl space-y-6">
      <header>
        <Link href="/research" className="text-sm font-medium text-accent hover:underline">
          ← Research Assistant
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Saved references</h1>
        <p className="mt-2 max-w-3xl leading-7 text-ink-soft">
          Publications you saved, with your private notes. Only you can see this list.
        </p>
      </header>

      {saved === null ? (
        <ErrorNote>
          Your saved references could not be loaded. The research library may not be set up yet (its
          database migration is missing), or the database is unreachable. Try again shortly.
        </ErrorNote>
      ) : saved.length === 0 ? (
        <EmptyState>
          Nothing saved yet. Use <strong>Save</strong> on any result in the{" "}
          <Link href="/research" className="font-medium text-accent hover:underline">
            Research Assistant
          </Link>{" "}
          to keep it here with a note.
        </EmptyState>
      ) : (
        <SavedList initial={saved} />
      )}

      <EvidenceLegend />
    </div>
  );
}
