"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Browse", match: (p: string) => p === "/" || p.startsWith("/listings") || p.startsWith("/sellers") },
  { href: "/sell", label: "Sell", match: (p: string) => p.startsWith("/sell") },
  { href: "/agent", label: "Demo agent", match: (p: string) => p.startsWith("/agent") },
  { href: "/dashboard", label: "Dashboard", match: (p: string) => p.startsWith("/dashboard") || p.startsWith("/orders") || p.startsWith("/inbox") },
];

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`flex items-center gap-2.5 font-display text-xl font-extrabold text-ink ${className}`}>
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-[9px] bg-accent text-base text-white">A</span>
      AgentShelf
    </Link>
  );
}

export function SiteHeader({ signedIn, name }: { signedIn: boolean; name: string | null }) {
  const pathname = usePathname() ?? "/";
  return (
    <header className="border-b border-line bg-white">
      <div className="mx-auto flex h-[68px] max-w-6xl items-center justify-between gap-4 px-4">
        <Logo />
        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {NAV.map((n) => {
            const active = n.match(pathname);
            return (
              <Link key={n.href} href={n.href} className={`rounded-lg px-3 py-2 text-sm ${active ? "bg-surface-2 font-semibold text-ink" : "font-medium text-ink-2 hover:bg-surface-2 hover:text-ink"}`}>
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          {signedIn ? (
            <>
              <Link href="/settings" className="btn-secondary max-w-[160px] truncate">
                {name ? name.split(" ")[0] : "Account"}
              </Link>
              <form action="/api/auth/logout" method="post" className="hidden md:block">
                <button className="rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-ink" type="submit">
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-secondary">
                Sign in
              </Link>
              <Link href="/signup" className="btn-primary hidden sm:inline-flex">
                Start selling
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
