import Link from "next/link";

import { requireUser } from "@/lib/auth";

import { NavLinks } from "./nav-links";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="min-h-screen md:flex">
      <aside className="border-b border-line bg-card md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0 md:border-r md:border-b-0">
        <div className="flex items-center justify-between px-4 py-4 md:block">
          <Link href="/dashboard" className="text-lg font-semibold tracking-tight">
            NeuroTrack
          </Link>
          <p className="hidden truncate text-xs text-muted md:mt-1 md:block">{user.email}</p>
        </div>
        <NavLinks />
        <div className="flex items-center gap-4 px-4 pb-4 md:absolute md:bottom-0">
          <Link href="/settings" className="text-sm text-ink-soft hover:text-ink">
            Settings
          </Link>
          <form action="/auth/signout" method="post">
            <button type="submit" className="text-sm text-ink-soft hover:text-ink">
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8">{children}</main>
    </div>
  );
}
