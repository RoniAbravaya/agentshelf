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
      <h1 className="text-2xl font-bold">Inbox</h1>
      {rows.length === 0 ? (
        <div className="card p-8 text-center text-slate-500">No conversations yet. Buyers (and their agents) can message you from any listing.</div>
      ) : (
        <ul className="card divide-y divide-slate-100">
          {rows.map((c) => (
            <li key={c.id}>
              <Link href={`/inbox/${c.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
                <div className="min-w-0">
                  <div className="truncate font-medium">{c.listing_title}</div>
                  <div className="truncate text-sm text-slate-500">{c.last_message ?? ""}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
                  <span>{c.sellerId === user.id ? "You are selling" : "You are buying"}</span>
                  {c.unread > 0 && <span className="badge bg-brand text-white">{c.unread}</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
