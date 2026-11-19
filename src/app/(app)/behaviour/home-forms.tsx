"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { joinCodeSchema } from "@/lib/behaviour/schemas";

import { createStudyAction } from "./actions";
import { inputClass, primaryButton, secondaryButton } from "./ui";

export function CreateStudyForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createStudyAction({ title, description });
      if (result.ok) {
        router.push(`/behaviour/studies/${result.data.id}`);
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-2xl border border-line bg-card p-5"
      aria-labelledby="create-heading"
    >
      <h2 id="create-heading" className="font-semibold">
        Create a study
      </h2>
      <label className="block text-sm">
        Title
        <input
          className={inputClass}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          required
        />
      </label>
      <label className="block text-sm">
        Description <span className="text-muted">(shown to people before they consent)</span>
        <textarea
          className={`${inputClass} min-h-20`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={2000}
        />
      </label>
      <p className="text-xs leading-5 text-muted">
        The study starts as <strong>synthetic</strong>. You can switch it to real data in its
        settings once you have an ethics approval reference.
      </p>
      <button type="submit" disabled={pending} className={`${primaryButton} w-full`}>
        {pending ? "Creating…" : "Create study"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </form>
  );
}

export function JoinCodeForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = joinCodeSchema.safeParse(code);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid code.");
      return;
    }
    setError(null);
    router.push(`/behaviour/join/${parsed.data}`);
  };

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-2xl border border-line bg-card p-5"
      aria-labelledby="join-heading"
    >
      <h2 id="join-heading" className="font-semibold">
        Join with a code
      </h2>
      <label className="block text-sm">
        Join code
        <input
          className={`${inputClass} font-mono uppercase tracking-widest`}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="K7M2Q9TX"
          autoComplete="off"
          maxLength={12}
        />
      </label>
      <p className="text-xs leading-5 text-muted">
        You will see the study and its consent information before anything is recorded.
      </p>
      <button type="submit" className={`${secondaryButton} w-full`}>
        Continue
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </form>
  );
}
