import Link from "next/link";
import { formatUsd } from "@agentshelf/shared";
import { getSeller, listConversationsForUser, listOrdersForBuyer, listOrdersForSeller, listSellerListings } from "@agentshelf/core";
import { ListingRowActions } from "@/components/listing-row-actions";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

const STATUS_BADGE: Record<string, string> = {
  AVAILABLE: "badge-ok",
  RESERVED: "badge-warn",
  SOLD: "badge-dark",
  PAUSED: "badge-muted",
  DRAFT: "badge-muted",
  PAID: "badge-ok",
  SHIPPED: "badge-info",
  PICKED_UP: "badge-info",
  COMPLETED: "badge-ok",
  PENDING_APPROVAL: "badge-warn",
  REFUNDED: "badge-muted",
  FAILED: "badge-muted",
  CANCELLED: "badge-muted",
};
const STATUS_LABEL: Record<string, string> = { AVAILABLE: "LIVE", PENDING_APPROVAL: "AWAITING APPROVAL", PICKED_UP: "PICKED UP" };

export default async function DashboardPage() {
  const user = await requireUser("/dashboard");
  const database = await db();
  const [seller, myListings, sales, purchases, conversations] = await Promise.all([
    getSeller(database, user.id),
    listSellerListings(database, user.id),
    listOrdersForSeller(database, user.id),
    listOrdersForBuyer(database, user.id, 20),
    listConversationsForUser(database, user.id),
  ]);
  const earnings = sales.filter((o) => o.status !== "REFUNDED").reduce((s, o) => s + o.totalCents, 0);
  const unread = conversations.reduce((s, c) => s + c.unread, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-extrabold md:text-[32px]">Hi {user.displayName.split(" ")[0]}</h1>
          <p className="mt-1 text-sm text-ink-2">
            Payouts go to <code className="mono text-[13px]">{seller?.paypalPayeeEmail}</code> ·{" "}
            <Link href="/settings" className="text-accent underline">
              change
            </Link>
          </p>
        </div>
        <Link href="/sell" className="btn-primary min-h-[46px] px-5 text-[15px]">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Sell an item
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Active listings" value={String(myListings.filter((l) => l.status === "AVAILABLE").length)} hint={`${myListings.filter((l) => l.status === "RESERVED").length} reserved in a checkout`} />
        <Stat label="Items sold" value={String(seller?.itemsSold ?? 0)} hint={`${sales.filter((o) => o.channel === "AGENT").length} via AI agents`} />
        <Stat label="Earned (gross)" value={formatUsd(earnings)} hint="Paid to your PayPal" />
        <Stat label="Rating" value={seller?.ratingAvg != null ? `${seller.ratingAvg.toFixed(1)}★` : "—"} hint={seller?.reviewCount ? `${seller.reviewCount} reviews` : "No reviews yet"} />
      </div>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-line px-5 py-4">
          <h2 className="font-display text-xl font-extrabold">Your listings</h2>
          <span className="text-[13px] text-muted">{myListings.length} total</span>
        </div>
        {myListings.length === 0 ? (
          <div className="p-6 text-sm text-ink-2">No listings yet.</div>
        ) : (
          <div>
            {myListings.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center gap-3.5 border-b border-surface-2 px-5 py-3.5 last:border-b-0">
                {l.photos[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={l.photos[0]} alt="" className="h-14 w-14 shrink-0 rounded-[10px] object-cover" />
                ) : (
                  <div className="h-14 w-14 shrink-0 rounded-[10px] bg-surface-2" />
                )}
                <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-0.5">
                  <Link href={l.status === "DRAFT" ? `/sell/${l.id}` : `/listings/${l.id}`} className="truncate text-[15px] font-semibold hover:underline">
                    {l.title || "(untitled draft)"}
                  </Link>
                  <span className="text-[13px] text-ink-2">
                    {formatUsd(l.priceCents)} · {l.areaLabel || "no area"} · {l.pickupEnabled ? "pickup" : ""}
                    {l.pickupEnabled && l.shippingEnabled ? " or " : ""}
                    {l.shippingEnabled ? "ship" : ""}
                  </span>
                </div>
                <span className={STATUS_BADGE[l.status] ?? "badge-muted"}>{STATUS_LABEL[l.status] ?? l.status}</span>
                <ListingRowActions id={l.id} status={l.status} />
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between gap-2.5 border-b border-line px-5 py-4">
            <h2 className="font-display text-xl font-extrabold">Sales</h2>
            <span className="text-[13px] text-muted">PayPal ids on each order</span>
          </div>
          {sales.length === 0 ? (
            <div className="p-6 text-sm text-ink-2">No sales yet. When an item sells you will see the order here with the delivery method.</div>
          ) : (
            <OrdersTable rows={sales.map((o) => ({ id: o.id, title: (o.listingSnapshot as { title?: string } | null)?.title ?? "", total: o.totalCents, status: o.status, fulfillment: o.fulfillment, channel: o.channel, created: o.createdAt, who: o.buyerName ?? "Buyer" }))} whoLabel="Buyer" />
          )}
        </section>
        <section className="card flex flex-col overflow-hidden">
          <div className="flex items-center justify-between gap-2.5 border-b border-line px-5 py-4">
            <h2 className="font-display text-xl font-extrabold">Inbox</h2>
            {unread > 0 && <span className="badge bg-accent text-white">{unread} unread</span>}
          </div>
          {conversations.length === 0 ? (
            <div className="p-6 text-sm text-ink-2">No conversations yet. Buyers and their agents can message you from any listing.</div>
          ) : (
            conversations.slice(0, 5).map((c) => (
              <Link key={c.id} href={`/inbox/${c.id}`} className="flex items-start gap-3 border-b border-surface-2 px-5 py-3.5 text-ink last:border-b-0 hover:bg-surface">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[13px] font-bold text-accent">{c.sellerId === user.id ? "B" : "S"}</span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-sm font-semibold">{c.listing_title}</span>
                  <span className="truncate text-[13px] text-ink-2">{c.last_message ?? ""}</span>
                </span>
                {c.unread > 0 && <span className="badge ml-auto bg-accent text-white">{c.unread}</span>}
              </Link>
            ))
          )}
          <Link href="/inbox" className="px-5 py-3.5 text-[13px] font-semibold text-accent">
            Open inbox →
          </Link>
        </section>
      </div>

      <section className="card overflow-hidden">
        <div className="border-b border-line px-5 py-4">
          <h2 className="font-display text-xl font-extrabold">Purchases</h2>
        </div>
        {purchases.length === 0 ? (
          <div className="p-6 text-sm text-ink-2">Nothing bought yet.</div>
        ) : (
          <OrdersTable rows={purchases.map((o) => ({ id: o.order_id, title: o.title, total: o.total_cents, status: o.status, fulfillment: o.fulfillment, channel: "", created: new Date(o.created_at), who: "" }))} whoLabel="" />
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="card flex flex-col gap-1 p-4">
      <span className="eyebrow">{label}</span>
      <span className="font-display text-[26px] font-extrabold">{value}</span>
      <span className="text-[13px] text-ink-2">{hint}</span>
    </div>
  );
}

function OrdersTable({ rows, whoLabel }: { rows: Array<{ id: string; title: string; total: number; status: string; fulfillment: string; channel: string; created: Date; who: string }>; whoLabel: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left">
          <tr>
            <th className="eyebrow px-5 py-2.5">Item</th>
            {whoLabel && <th className="eyebrow px-3 py-2.5">{whoLabel}</th>}
            <th className="eyebrow px-3 py-2.5">Total</th>
            <th className="eyebrow px-3 py-2.5">Status</th>
            <th className="eyebrow px-5 py-2.5">When</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-surface-2">
              <td className="px-5 py-3">
                <Link className="font-semibold hover:underline" href={`/orders/${r.id}`}>
                  {r.title}
                </Link>
                <div className="text-xs text-muted">
                  {r.fulfillment === "SHIP" ? "Shipping" : "Pickup"}
                  {r.channel === "AGENT" && <span className="badge-ai ml-1.5">agent</span>}
                </div>
              </td>
              {whoLabel && <td className="whitespace-nowrap px-3 py-3">{r.who}</td>}
              <td className="whitespace-nowrap px-3 py-3 font-semibold">{formatUsd(r.total)}</td>
              <td className="px-3 py-3">
                <span className={STATUS_BADGE[r.status] ?? "badge-muted"}>{STATUS_LABEL[r.status] ?? r.status}</span>
              </td>
              <td className="whitespace-nowrap px-5 py-3 text-muted">{r.created.toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
