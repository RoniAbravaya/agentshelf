import Link from "next/link";
import { listConversationsForUser } from "@agentshelf/core";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inbox" };

export default async function InboxPage() {
  const user = await requireUser("/inbox");
  const rows = await listConversationsForUser(await db(), user.id);
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="font-display text-[26px] font-extrabold md:text-[32px]">Inbox</h1>
      {rows.length === 0 ? (
        <div className="card p-8 text-center text-ink-2">No conversations yet. Buyers (and their agents) can message you from any listing.</div>
      ) : (
        <ul className="card divide-y divide-surface-2 overflow-hidden">
          {rows.map((c) => (
            <li key={c.id}>
              <Link href={`/inbox/${c.id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-bold text-accent">{c.sellerId === user.id ? "B" : "S"}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{c.listing_title}</div>
                  <div className="truncate text-sm text-ink-2">{c.last_message ?? ""}</div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 text-xs text-muted">
                  <span>{c.sellerId === user.id ? "You are selling" : "You are buying"}</span>
                  {c.unread > 0 && <span className="badge bg-accent text-white">{c.unread}</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
