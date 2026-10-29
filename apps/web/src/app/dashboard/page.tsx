import Link from "next/link";
import { formatUsd } from "@agentshelf/shared";
import { getSeller, listOrdersForBuyer, listOrdersForSeller, listSellerListings } from "@agentshelf/core";
import { ListingRowActions } from "@/components/listing-row-actions";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser("/dashboard");
  const database = await db();
  const [seller, myListings, sales, purchases] = await Promise.all([getSeller(database, user.id), listSellerListings(database, user.id), listOrdersForSeller(database, user.id), listOrdersForBuyer(database, user.id, 20)]);
  const earnings = sales.filter((o) => o.status !== "REFUNDED").reduce((s, o) => s + o.totalCents, 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Hi {user.displayName.split(" ")[0]}</h1>
          <p className="text-sm text-slate-500">
            Payouts go to <code>{seller?.paypalPayeeEmail}</code> ·{" "}
            <Link href="/settings" className="underline">
              change
            </Link>
          </p>
        </div>
        <Link href="/sell" className="btn-primary">
          Sell an item
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Active listings" value={String(myListings.filter((l) => l.status === "AVAILABLE").length)} />
        <Stat label="Items sold" value={String(seller?.itemsSold ?? 0)} />
        <Stat label="Earned (gross)" value={formatUsd(earnings)} />
        <Stat label="Rating" value={seller?.ratingAvg != null ? `${seller.ratingAvg.toFixed(1)}★ (${seller.reviewCount})` : "No reviews yet"} />
      </div>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Your listings</h2>
        {myListings.length === 0 ? (
          <div className="card p-6 text-sm text-slate-500">No listings yet.</div>
        ) : (
          <div className="card divide-y divide-slate-100">
            {myListings.map((l) => (
              <div key={l.id} className="flex items-center gap-3 px-4 py-3">
                {l.photos[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={l.photos[0]} alt="" className="h-14 w-14 rounded-md object-cover" />
                ) : (
                  <div className="h-14 w-14 rounded-md bg-slate-100" />
                )}
                <div className="min-w-0 flex-1">
                  <Link href={l.status === "DRAFT" ? `/sell/${l.id}` : `/listings/${l.id}`} className="block truncate font-medium hover:underline">
                    {l.title || "(untitled draft)"}
                  </Link>
                  <div className="text-xs text-slate-500">
                    {formatUsd(l.priceCents)} · <StatusBadge status={l.status} /> · {l.areaLabel || "no area"}
                  </div>
                </div>
                <ListingRowActions id={l.id} status={l.status} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Sales</h2>
        {sales.length === 0 ? (
          <div className="card p-6 text-sm text-slate-500">No sales yet. When an item sells you will see the order here with the delivery method.</div>
        ) : (
          <OrdersTable rows={sales.map((o) => ({ id: o.id, title: (o.listingSnapshot as { title?: string } | null)?.title ?? "", total: o.totalCents, status: o.status, fulfillment: o.fulfillment, channel: o.channel, created: o.createdAt }))} />
        )}
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Purchases</h2>
        {purchases.length === 0 ? (
          <div className="card p-6 text-sm text-slate-500">Nothing bought yet.</div>
        ) : (
          <OrdersTable rows={purchases.map((o) => ({ id: o.order_id, title: o.title, total: o.total_cents, status: o.status, fulfillment: o.fulfillment, channel: "", created: new Date(o.created_at) }))} />
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "AVAILABLE" ? "bg-green-100 text-green-800" : status === "SOLD" ? "bg-slate-800 text-white" : status === "RESERVED" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700";
  return <span className={`badge ${cls}`}>{status}</span>;
}

function OrdersTable({ rows }: { rows: Array<{ id: string; title: string; total: number; status: string; fulfillment: string; channel: string; created: Date }> }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="px-4 py-2">Order</th>
            <th className="px-4 py-2">Item</th>
            <th className="px-4 py-2">Total</th>
            <th className="px-4 py-2">Delivery</th>
            <th className="px-4 py-2">Status</th>
            <th className="px-4 py-2">When</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="px-4 py-2">
                <Link className="font-mono text-xs underline" href={`/orders/${r.id}`}>
                  {r.id}
                </Link>
                {r.channel === "AGENT" && <span className="badge ml-1 bg-violet-100 text-violet-800">agent</span>}
              </td>
              <td className="px-4 py-2">{r.title}</td>
              <td className="px-4 py-2">{formatUsd(r.total)}</td>
              <td className="px-4 py-2">{r.fulfillment === "SHIP" ? "Shipping" : "Pickup"}</td>
              <td className="px-4 py-2">{r.status}</td>
              <td className="px-4 py-2 text-slate-500">{r.created.toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
