import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { formatUsd } from "@agentshelf/shared";
import { CommerceError, getOrderForUser, pickupAddressFor, refreshPayoutStatus, schema } from "@agentshelf/core";
import { OrderActions } from "@/components/order-actions";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Order" };

const STATUS_LABEL: Record<string, string> = {
  PENDING_APPROVAL: "Waiting for PayPal approval",
  PAID: "Paid",
  SHIPPED: "Shipped",
  PICKED_UP: "Picked up",
  COMPLETED: "Completed",
  REFUNDED: "Refunded",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ paid?: string; error?: string; status?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser(`/orders/${id}`);
  const database = await db();
  let data;
  try {
    data = await getOrderForUser(database, id, user.id);
  } catch (err) {
    if (err instanceof CommerceError) notFound();
    throw err;
  }
  const { order, role, listing, seller, buyer_name, seller_contact } = data;
  const snapshot = (order.listingSnapshot ?? {}) as { title?: string; photos?: string[]; seller_name?: string };
  const paid = ["PAID", "SHIPPED", "PICKED_UP", "COMPLETED"].includes(order.status);
  const conversation = order.buyerId ? await database.query.conversations.findFirst({ where: and(eq(schema.conversations.listingId, order.listingId), eq(schema.conversations.buyerId, order.buyerId)) }) : null;
  const review = await database.query.reviews.findFirst({ where: eq(schema.reviews.orderId, order.id) });
  if (role === "seller" && order.paypalPayoutBatchId && order.payoutStatus !== "SUCCESS") {
    const refreshed = await refreshPayoutStatus(database, order.id);
    order.payoutStatus = refreshed.payoutStatus;
    order.payoutError = refreshed.payoutError;
  }
  const pickupAddress = paid && order.fulfillment === "PICKUP" && listing ? pickupAddressFor(listing) : null;
  const address = order.shippingAddress as Record<string, string | null> | null;
  const badge = paid ? "badge-ok" : order.status === "PENDING_APPROVAL" ? "badge-warn" : "badge-muted";

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {sp.paid && <div className="rounded-xl bg-ok-soft p-3 text-sm text-ok">Payment complete. Thanks for buying on AgentShelf!</div>}
      {sp.error && <div className="rounded-xl bg-danger-soft p-3 text-sm text-danger">{sp.error}</div>}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-[22px] font-extrabold md:text-[28px]">Order {order.id}</h1>
          <p className="text-sm text-ink-2">
            {role === "buyer" ? "You bought" : `${buyer_name ?? "A buyer"} bought`} this {order.channel === "AGENT" ? "through an AI agent" : "on the web"} · {new Date(order.createdAt).toLocaleString()}
          </p>
        </div>
        <span className={badge}>{STATUS_LABEL[order.status] ?? order.status}</span>
      </div>

      <div className="card flex gap-4 p-4 md:p-5">
        {snapshot.photos?.[0] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={snapshot.photos[0]} alt="" className="h-[72px] w-[72px] shrink-0 rounded-xl object-cover md:h-24 md:w-24" />
        )}
        <div className="min-w-0 flex-1 text-sm">
          <Link href={`/listings/${order.listingId}`} className="font-semibold hover:underline">
            {snapshot.title ?? listing?.title}
          </Link>
          <div className="text-ink-2">Seller: {snapshot.seller_name ?? seller?.displayName}</div>
          <dl className="mt-2 grid grid-cols-2 gap-1">
            <dt className="text-ink-2">Item</dt>
            <dd className="text-right">{formatUsd(order.itemCents)}</dd>
            <dt className="text-ink-2">{order.fulfillment === "SHIP" ? "Shipping" : "Local pickup"}</dt>
            <dd className="text-right">{formatUsd(order.shippingCents)}</dd>
            <dt className="font-semibold">Paid via PayPal</dt>
            <dd className="text-right font-display text-lg font-extrabold">{formatUsd(order.totalCents)}</dd>
          </dl>
        </div>
      </div>

      <div className="card flex flex-col gap-2 p-4 text-sm md:p-5">
        <h2 className="font-display text-base font-extrabold">PayPal</h2>
        <dl className="grid grid-cols-[140px_1fr] gap-1 md:grid-cols-[160px_1fr]">
          <dt className="text-ink-2">PayPal order id</dt>
          <dd className="mono break-all">{order.paypalOrderId ?? "-"}</dd>
          <dt className="text-ink-2">Capture id</dt>
          <dd className="mono break-all">{order.paypalCaptureId ?? "-"}</dd>
          {order.paypalRefundId && (
            <>
              <dt className="text-ink-2">Refund id</dt>
              <dd className="mono break-all">{order.paypalRefundId}</dd>
            </>
          )}
          <dt className="text-ink-2">Payee</dt>
          <dd className="break-all">{order.channel === "AGENT" && order.paypalPayoutBatchId ? "Platform account, then paid out to the seller" : seller?.paypalPayeeEmail}</dd>
          {order.policyResult && (
            <>
              <dt className="text-ink-2">Policy decision</dt>
              <dd>{order.policyResult}</dd>
            </>
          )}
          {order.paypalPayoutBatchId && (
            <>
              <dt className="text-ink-2">Seller payout</dt>
              <dd>
                <span className={order.payoutStatus === "SUCCESS" ? "badge-ok" : order.payoutStatus === "FAILED" ? "badge-muted" : "badge-warn"}>{order.payoutStatus ?? "PENDING"}</span> {formatUsd(order.payoutCents ?? order.totalCents)} to {seller?.paypalPayeeEmail} · batch <span className="mono">{order.paypalPayoutBatchId}</span>
                {order.payoutError && <span className="text-danger"> · {order.payoutError}</span>}
              </dd>
            </>
          )}
          {!order.paypalPayoutBatchId && order.payoutStatus === "FAILED" && (
            <>
              <dt className="text-ink-2">Seller payout</dt>
              <dd className="text-danger">Failed: {order.payoutError}</dd>
            </>
          )}
        </dl>
        {order.status === "PENDING_APPROVAL" && order.approvalUrl && (
          <a className="btn-accent self-start text-sm" href={order.approvalUrl}>
            Approve this payment in PayPal
          </a>
        )}
        {order.failureReason && <p className="text-danger">{order.failureReason}</p>}
      </div>

      <div className="card flex flex-col gap-2 p-4 text-sm md:p-5">
        <h2 className="font-display text-base font-extrabold">{order.fulfillment === "SHIP" ? "Shipping" : "Pickup"}</h2>
        {order.fulfillment === "SHIP" && address && (
          <p>
            {address.name && <strong>{address.name}</strong>}
            <br />
            {[address.address_line_1, address.address_line_2, `${address.admin_area_2 ?? ""} ${address.admin_area_1 ?? ""} ${address.postal_code ?? ""}`, address.country_code].filter(Boolean).join(", ")}
          </p>
        )}
        {order.fulfillment === "SHIP" && order.trackingNumber && (
          <p>
            Tracking: <span className="mono">{order.trackingNumber}</span> ({order.carrier}) · also attached to the PayPal transaction
          </p>
        )}
        {order.fulfillment === "PICKUP" && role === "buyer" && (pickupAddress ? <p>Exact address, shared now that you have paid: <strong>{pickupAddress}</strong></p> : <p className="text-ink-2">The exact address appears here after payment.</p>)}
        {order.fulfillment === "PICKUP" && role === "seller" && <p className="text-ink-2">Agree a time with the buyer in chat. The buyer confirms collection.</p>}
        {role === "buyer" && seller_contact.phone && <p>Seller contact (shared after purchase): {seller_contact.phone}</p>}
        {conversation && (
          <Link className="btn-secondary self-start" href={`/inbox/${conversation.id}`}>
            Open chat with {role === "buyer" ? "seller" : "buyer"}
          </Link>
        )}
      </div>

      <OrderActions orderId={order.id} role={role} status={order.status} fulfillment={order.fulfillment as "PICKUP" | "SHIP"} reviewed={Boolean(review)} totalCents={order.totalCents} />
    </div>
  );
}
