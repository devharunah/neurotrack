"use client";

import { useId, useState, useTransition } from "react";

import { DELETE_CONFIRMATION, DISPLAY_NAME_MAX } from "@/lib/account/schema";

import { deleteHistoryAction, updateDisplayNameAction } from "./actions";

type Status = { tone: "ok" | "error"; text: string } | null;

function StatusLine({ status }: { status: Status }) {
  if (!status) return null;
  return (
    <p
      role={status.tone === "error" ? "alert" : "status"}
      className={`text-sm ${status.tone === "error" ? "text-red-700" : "text-accent"}`}
    >
      {status.text}
    </p>
  );
}

export function DisplayNameForm({ initial }: { initial: string }) {
  const inputId = useId();
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [status, setStatus] = useState<Status>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    startTransition(async () => {
      const result = await updateDisplayNameAction(value);
      if (result.ok) {
        setValue(result.data.displayName);
        setSaved(result.data.displayName);
        setStatus({ tone: "ok", text: "Display name saved." });
      } else {
        setStatus({ tone: "error", text: result.error });
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label htmlFor={inputId} className="block text-sm font-medium">
        Display name
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id={inputId}
          name="displayName"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          maxLength={DISPLAY_NAME_MAX}
          autoComplete="nickname"
          required
          className="min-w-0 flex-1 rounded-lg border border-line bg-card px-3 py-2"
        />
        <button
          type="submit"
          disabled={pending || value.trim() === saved}
          className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink-soft disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      <p className="text-xs text-muted">
        Shown in the app only. Up to {DISPLAY_NAME_MAX} characters. Your role cannot be changed
        here.
      </p>
      <StatusLine status={status} />
    </form>
  );
}

export function DeleteHistory({ count }: { count: number | null }) {
  const inputId = useId();
  const [confirming, setConfirming] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [status, setStatus] = useState<Status>(null);
  const [pending, startTransition] = useTransition();

  function remove(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    startTransition(async () => {
      const result = await deleteHistoryAction({ confirmation });
      if (result.ok) {
        setConfirming(false);
        setConfirmation("");
        const n = result.data.deleted;
        setStatus({
          tone: "ok",
          text: `Deleted ${n} saved experiment${n === 1 ? "" : "s"}.`,
        });
      } else {
        setStatus({ tone: "error", text: result.error });
      }
    });
  }

  if (!confirming) {
    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => {
            setStatus(null);
            setConfirming(true);
          }}
          disabled={count === 0}
          className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          Delete all my experiment history
        </button>
        <StatusLine status={status} />
      </div>
    );
  }

  return (
    <form
      onSubmit={remove}
      className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-4"
      aria-label="Confirm deleting experiment history"
    >
      <p className="text-sm leading-6 text-red-900">
        This permanently deletes {count === null ? "all" : `all ${count}`} of your saved experiments
        across every lab. It cannot be undone. Download your data first if you want a copy.
      </p>
      <label htmlFor={inputId} className="block text-sm font-medium text-red-900">
        Type <code className="font-mono">{DELETE_CONFIRMATION}</code> to confirm
      </label>
      <input
        id={inputId}
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
        autoComplete="off"
        className="w-full rounded-lg border border-red-300 bg-card px-3 py-2 sm:w-64"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending || confirmation !== DELETE_CONFIRMATION}
          className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
        >
          {pending ? "Deleting…" : "Permanently delete"}
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            setConfirmation("");
          }}
          disabled={pending}
          className="rounded-lg border border-line bg-card px-4 py-2 text-sm font-medium"
        >
          Cancel
        </button>
      </div>
      <StatusLine status={status} />
    </form>
  );
}
