"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const icons = {
  browse: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
  sell: (
    <>
      <path d="M4 8h16v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
      <circle cx="12" cy="14" r="3" />
    </>
  ),
  orders: (
    <>
      <path d="M6 2h12l2 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7z" />
      <path d="M4 7h16M9 11a3 3 0 0 0 6 0" />
    </>
  ),
  agent: <path d="M12 2l2.4 5.6L20 9.5l-5.6 2.4L12 17.5l-2.4-5.6L4 9.5l5.6-1.9z" />,
  account: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
};

export function MobileTabs({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname() ?? "/";
  const tabs = [
    { href: "/", label: "Browse", icon: icons.browse, active: pathname === "/" || pathname.startsWith("/listings") },
    { href: "/sell", label: "Sell", icon: icons.sell, active: pathname.startsWith("/sell") },
    { href: signedIn ? "/dashboard" : "/login?next=/dashboard", label: "Orders", icon: icons.orders, active: pathname.startsWith("/dashboard") || pathname.startsWith("/orders") },
    { href: "/agent", label: "Agent", icon: icons.agent, active: pathname.startsWith("/agent") },
    { href: signedIn ? "/settings" : "/login", label: "Account", icon: icons.account, active: pathname.startsWith("/settings") || pathname.startsWith("/login") || pathname.startsWith("/signup") || pathname.startsWith("/inbox") },
  ];
  return (
    <nav aria-label="Tabs" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-white px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-1.5 md:hidden">
      {tabs.map((t) => (
        <Link key={t.label} href={t.href} className={`flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg py-1 text-[11px] ${t.active ? "font-semibold text-accent" : "font-medium text-ink-2"}`}>
          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {t.icon}
          </svg>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
