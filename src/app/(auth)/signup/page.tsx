import type { Metadata } from "next";
import Link from "next/link";

import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <>
      <h1 className="text-xl font-semibold">Create your account</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Free, for students, researchers and anyone curious about the science.
      </p>
      <div className="mt-6">
        <AuthForm mode="signup" next="/dashboard" />
      </div>
      <p className="mt-6 text-sm text-ink-soft">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
