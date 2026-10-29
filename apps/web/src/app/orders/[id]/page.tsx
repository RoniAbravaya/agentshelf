import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { formatUsd } from "@agentshelf/shared";
import { CommerceError, getOrderForUser, pickupAddressFor, schema } from "@agentshelf/core";
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
  const conversation = order.buyerId
    ? await database.query.conversations.findFirst({ where: and(eq(schema.conversations.listingId, order.listingId), eq(schema.conversations.buyerId, order.buyerId)) })
    : null;
  const review = await database.query.reviews.findFirst({ where: eq(schema.reviews.orderId, order.id) });
  const pickupAddress = paid && order.fulfillment === "PICKUP" && listing ? pickupAddressFor(listing) : null;
  const address = order.shippingAddress as Record<string, string | null> | null;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {sp.paid && <div className="rounded-lg bg-green-50 p-3 text-sm text-green-800">Payment complete. Thanks for buying on AgentShelf!</div>}
      {sp.error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{sp.error}</div>}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Order {order.id}</h1>
          <p className="text-sm text-slate-500">
            {role === "buyer" ? "You bought" : `${buyer_name ?? "A buyer"} bought`} this {order.channel === "AGENT" ? "through an AI agent" : "on the web"} · {new Date(order.createdAt).toLocaleString()}
          </p>
        </div>
        <span className={`badge ${paid ? "bg-green-100 text-green-800" : order.status === "PENDING_APPROVAL" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}`}>{STATUS_LABEL[order.status] ?? order.status}</span>
      </div>

      <div className="card flex gap-4 p-5">
        {snapshot.photos?.[0] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={snapshot.photos[0]} alt="" className="h-24 w-24 rounded-lg object-cover" />
        )}
        <div className="flex-1 text-sm">
          <Link href={`/listings/${order.listingId}`} className="font-semibold hover:underline">
            {snapshot.title ?? listing?.title}
          </Link>
          <div className="text-slate-500">Seller: {snapshot.seller_name ?? seller?.displayName}</div>
          <dl className="mt-2 grid grid-cols-2 gap-1">
            <dt className="text-slate-500">Item</dt>
            <dd className="text-right">{formatUsd(order.itemCents)}</dd>
            <dt className="text-slate-500">{order.fulfillment === "SHIP" ? "Shipping" : "Local pickup"}</dt>
            <dd className="text-right">{formatUsd(order.shippingCents)}</dd>
            <dt className="font-semibold">Total paid via PayPal</dt>
            <dd className="text-right font-semibold">{formatUsd(order.totalCents)}</dd>
          </dl>
        </div>
      </div>

      <div className="card space-y-2 p-5 text-sm">
        <h2 className="font-semibold">PayPal</h2>
        <dl className="grid grid-cols-[160px_1fr] gap-1">
          <dt className="text-slate-500">PayPal order id</dt>
          <dd className="font-mono">{order.paypalOrderId ?? "-"}</dd>
          <dt className="text-slate-500">Capture id</dt>
          <dd className="font-mono">{order.paypalCaptureId ?? "-"}</dd>
          {order.paypalRefundId && (
            <>
              <dt className="text-slate-500">Refund id</dt>
              <dd className="font-mono">{order.paypalRefundId}</dd>
            </>
          )}
          <dt className="text-slate-500">Payee</dt>
          <dd>{seller?.paypalPayeeEmail}</dd>
          {order.policyResult && (
            <>
              <dt className="text-slate-500">Policy decision</dt>
              <dd>{order.policyResult}</dd>
            </>
          )}
        </dl>
        {order.status === "PENDING_APPROVAL" && order.approvalUrl && (
          <a className="btn-accent" href={order.approvalUrl}>
            Approve this payment in PayPal
          </a>
        )}
        {order.failureReason && <p className="text-red-700">{order.failureReason}</p>}
      </div>

      <div className="card space-y-2 p-5 text-sm">
        <h2 className="font-semibold">{order.fulfillment === "SHIP" ? "Shipping" : "Pickup"}</h2>
        {order.fulfillment === "SHIP" && address && (
          <p>
            {address.name && <strong>{address.name}</strong>}
            <br />
            {[address.address_line_1, address.address_line_2, `${address.admin_area_2 ?? ""} ${address.admin_area_1 ?? ""} ${address.postal_code ?? ""}`, address.country_code].filter(Boolean).join(", ")}
          </p>
        )}
        {order.fulfillment === "SHIP" && order.trackingNumber && (
          <p>
            Tracking: <span className="font-mono">{order.trackingNumber}</span> ({order.carrier}) · also attached to the PayPal transaction
          </p>
        )}
        {order.fulfillment === "PICKUP" && role === "buyer" && (pickupAddress ? <p>Pickup address: <strong>{pickupAddress}</strong></p> : <p className="text-slate-500">The exact address appears here after payment.</p>)}
        {order.fulfillment === "PICKUP" && role === "seller" && <p className="text-slate-500">Agree a time with the buyer in chat. The buyer confirms collection.</p>}
        {role === "buyer" && seller_contact.phone && <p>Seller contact (shared after purchase): {seller_contact.phone}</p>}
        {conversation && (
          <Link className="btn-secondary" href={`/inbox/${conversation.id}`}>
            Open chat with {role === "buyer" ? "seller" : "buyer"}
          </Link>
        )}
      </div>

      <OrderActions orderId={order.id} role={role} status={order.status} fulfillment={order.fulfillment as "PICKUP" | "SHIP"} reviewed={Boolean(review)} totalCents={order.totalCents} />
    </div>
  );
}
