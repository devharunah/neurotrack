"use client";

import { useState, useTransition } from "react";

import { withdrawConsentAction } from "../../actions";
import { secondaryButton } from "../../ui";

export function WithdrawPanel({ studyId }: { studyId: string }) {
  const [open, setOpen] = useState(false);
  const [deleteData, setDeleteData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const withdraw = () => {
    setError(null);
    startTransition(async () => {
      const result = await withdrawConsentAction(studyId, deleteData);
      if (!result.ok) {
        setError(result.error);
      }
    });
  };

  return (
    <section
      aria-labelledby="withdraw-heading"
      className="space-y-3 rounded-2xl border border-line bg-card p-5"
    >
      <h2 id="withdraw-heading" className="font-semibold">
        Withdraw consent
      </h2>
      <p className="text-sm leading-6 text-ink-soft">
        You can stop taking part at any time, without giving a reason. After you withdraw, no new
        check-ins are accepted.
      </p>
      {!open ? (
        <button type="button" className={secondaryButton} onClick={() => setOpen(true)}>
          Withdraw from this study…
        </button>
      ) : (
        <div className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-4">
          <label className="flex items-start gap-3 text-sm leading-6">
            <input
              type="checkbox"
              checked={deleteData}
              onChange={(e) => setDeleteData(e.target.checked)}
              className="mt-1 size-4"
            />
            Also delete every check-in I have already submitted.
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={withdraw}
              disabled={pending}
              className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              {pending ? "Withdrawing…" : "Confirm withdrawal"}
            </button>
            <button type="button" className={secondaryButton} onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
