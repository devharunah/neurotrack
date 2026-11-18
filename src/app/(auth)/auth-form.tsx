"use client";

import { useActionState, useState } from "react";

import { type AuthState, signInWithMagicLink, signInWithPassword, signUp } from "./actions";

const inputClass =
  "mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 outline-none focus:border-accent";

export function AuthForm({ mode, next }: { mode: "login" | "signup"; next: string }) {
  const [useLink, setUseLink] = useState(false);
  const action = mode === "signup" ? signUp : useLink ? signInWithMagicLink : signInWithPassword;
  const [state, formAction, pending] = useActionState<AuthState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <label className="block text-sm font-medium">
        Email
        <input name="email" type="email" autoComplete="email" required className={inputClass} />
      </label>
      {!useLink && (
        <label className="block text-sm font-medium">
          Password
          <input
            name="password"
            type="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            minLength={8}
            required
            className={inputClass}
          />
        </label>
      )}

      {state.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.message && <output className="block text-sm text-accent">{state.message}</output>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-ink px-4 py-2.5 font-medium text-white hover:bg-ink-soft disabled:opacity-60"
      >
        {pending
          ? "Working…"
          : mode === "signup"
            ? "Create account"
            : useLink
              ? "Email me a sign-in link"
              : "Sign in"}
      </button>

      {mode === "login" && (
        <button
          type="button"
          onClick={() => setUseLink((value) => !value)}
          className="w-full text-sm text-ink-soft underline-offset-4 hover:underline"
        >
          {useLink ? "Use a password instead" : "Sign in with an email link instead"}
        </button>
      )}
    </form>
  );
}
