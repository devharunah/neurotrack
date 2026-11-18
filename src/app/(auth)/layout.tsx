import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          NeuroTrack
        </Link>
        <div className="mt-6 rounded-2xl border border-line bg-card p-6 shadow-sm">{children}</div>
      </div>
    </main>
  );
}
