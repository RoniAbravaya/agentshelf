import Link from "next/link";

const ITEMS = [
  { id: "selling", href: "/settings", label: "Selling & payouts" },
  { id: "wallet", href: "/settings/wallet", label: "Agent wallet & rules" },
  { id: "orders", href: "/dashboard", label: "Orders" },
  { id: "inbox", href: "/inbox", label: "Inbox" },
];

export function SettingsNav({ current }: { current: string }) {
  return (
    <nav aria-label="Settings" className="flex w-full flex-wrap gap-1 text-sm md:w-[220px] md:flex-col">
      {ITEMS.map((i) => (
        <Link key={i.id} href={i.href} className={`rounded-[10px] px-3 py-2.5 ${i.id === current ? "card font-bold text-ink" : "font-medium text-ink-2 hover:bg-surface-2"}`}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
