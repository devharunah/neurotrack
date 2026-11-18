"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/quantum", label: "QuantumLab" },
  { href: "/quantum/qml", label: "↳ Quantum vs classical" },
  { href: "/neuro", label: "NeuroLab" },
  { href: "/behaviour", label: "BehaviourLab" },
  { href: "/research", label: "Research Assistant" },
] as const;

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto px-2 pb-3 md:flex-col md:pb-0">
      {LINKS.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm ${
              active ? "bg-paper font-semibold text-ink" : "text-ink-soft hover:bg-paper"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
