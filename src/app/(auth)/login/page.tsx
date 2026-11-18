import type { Metadata } from "next";
import Link from "next/link";

import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  return (
    <>
      <h1 className="text-xl font-semibold">Sign in</h1>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          That sign-in link is invalid or has expired.
        </p>
      )}
      <div className="mt-6">
        <AuthForm mode="login" next={next ?? "/dashboard"} />
      </div>
      <p className="mt-6 text-sm text-ink-soft">
        New here?{" "}
        <Link href="/signup" className="font-medium text-accent hover:underline">
          Create an account
        </Link>
      </p>
    </>
  );
}
