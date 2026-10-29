import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { listings, orders, reservations, webhookEvents } from "../db/schema";
import { getPayPal } from "../paypal/client";
import type { PayPalWebhookEvent, WebhookHeaders } from "../paypal/types";
import { audit } from "./audit";
import { captureOrder, markOrderPaid } from "./orders";
import { syncWalletFromWebhook } from "./wallet";

export interface WebhookResult {
  status: "processed" | "duplicate" | "ignored" | "rejected";
  event_type?: string;
  detail?: string;
}

export function readWebhookHeaders(get: (name: string) => string | null | undefined): WebhookHeaders | null {
  const h = {
    transmissionId: get("paypal-transmission-id") ?? "",
    transmissionTime: get("paypal-transmission-time") ?? "",
    transmissionSig: get("paypal-transmission-sig") ?? "",
    certUrl: get("paypal-cert-url") ?? "",
    authAlgo: get("paypal-auth-algo") ?? "",
  };
  return Object.values(h).every(Boolean) ? h : null;
}

/**
 * Verify, store and process a PayPal webhook. Idempotent on the PayPal event id
 * and tolerant of out-of-order delivery: every handler re-reads current state.
 */
export async function processWebhook(db: Db, headers: WebhookHeaders | null, rawBody: string): Promise<WebhookResult> {
  const paypal = getPayPal();
  if (!paypal) return { status: "rejected", detail: "PayPal not configured" };
  let event: PayPalWebhookEvent;
  try {
    event = JSON.parse(rawBody) as PayPalWebhookEvent;
  } catch {
    return { status: "rejected", detail: "invalid JSON" };
  }
  if (!event?.id || !event.event_type) return { status: "rejected", detail: "missing id or event_type" };

  if (!headers) {
    await audit(db, { actor: "system", action: "webhook.rejected", entity: "webhook", entityId: event.id, details: { reason: "missing signature headers" } });
    return { status: "rejected", event_type: event.event_type, detail: "missing signature headers" };
  }
  let verified = false;
  try {
    verified = await paypal.verifyWebhookSignature(headers, event);
  } catch (err) {
    await audit(db, { actor: "system", action: "webhook.verify_error", entity: "webhook", entityId: event.id, details: { error: String(err) } });
    return { status: "rejected", event_type: event.event_type, detail: `verification error: ${err instanceof Error ? err.message : err}` };
  }
  if (!verified) {
    await audit(db, { actor: "system", action: "webhook.rejected", entity: "webhook", entityId: event.id, details: { reason: "signature verification failed" } });
    return { status: "rejected", event_type: event.event_type, detail: "signature verification failed" };
  }

  const inserted = await db
    .insert(webhookEvents)
    .values({ id: event.id, eventType: event.event_type, resourceType: event.resource_type ?? null, payload: event, verified: true })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id });
  if (inserted.length === 0) {
    const prior = await db.query.webhookEvents.findFirst({ where: eq(webhookEvents.id, event.id) });
    if (prior?.processedAt) return { status: "duplicate", event_type: event.event_type };
  }

  try {
    const detail = await handle(db, event);
    await db.update(webhookEvents).set({ processedAt: new Date(), error: null }).where(eq(webhookEvents.id, event.id));
    return { status: detail === "ignored" ? "ignored" : "processed", event_type: event.event_type, detail };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.update(webhookEvents).set({ error: message }).where(eq(webhookEvents.id, event.id));
    throw err;
  }
}

async function handle(db: Db, event: PayPalWebhookEvent): Promise<string> {
  const r = (event.resource ?? {}) as Record<string, unknown>;
  const customId = typeof r.custom_id === "string" ? r.custom_id : undefined;
  const relatedOrderId = (r.supplementary_data as { related_ids?: { order_id?: string } } | undefined)?.related_ids?.order_id;

  switch (event.event_type) {
    case "CHECKOUT.ORDER.APPROVED": {
      const paypalOrderId = typeof r.id === "string" ? r.id : undefined;
      if (!paypalOrderId) return "no order id";
      const order = await db.query.orders.findFirst({ where: eq(orders.paypalOrderId, paypalOrderId) });
      if (!order) return "unknown order";
      if (order.status !== "PENDING_APPROVAL") return `order already ${order.status}`;
      const result = await captureOrder(db, { orderId: order.id });
      return `captured -> ${result.status}`;
    }
    case "PAYMENT.CAPTURE.COMPLETED": {
      const captureId = typeof r.id === "string" ? r.id : null;
      const order = customId
        ? await db.query.orders.findFirst({ where: eq(orders.id, customId) })
        : relatedOrderId
          ? await db.query.orders.findFirst({ where: eq(orders.paypalOrderId, relatedOrderId) })
          : null;
      if (!order) return "unknown order";
      const paid = await markOrderPaid(db, order, null, captureId);
      return `order ${paid.status}`;
    }
    case "PAYMENT.CAPTURE.DENIED":
    case "PAYMENT.CAPTURE.DECLINED": {
      const order = customId ? await db.query.orders.findFirst({ where: eq(orders.id, customId) }) : null;
      if (!order) return "unknown order";
      if (order.status === "PENDING_APPROVAL") {
        await db.update(orders).set({ status: "FAILED", failureReason: event.event_type, updatedAt: new Date() }).where(eq(orders.id, order.id));
        await db.delete(reservations).where(eq(reservations.listingId, order.listingId));
        await db.update(listings).set({ status: "AVAILABLE", updatedAt: new Date() }).where(eq(listings.id, order.listingId));
        return "order FAILED, listing released";
      }
      return `order already ${order.status}`;
    }
    case "PAYMENT.CAPTURE.REVERSED":
    case "PAYMENT.CAPTURE.REFUNDED": {
      const refundId = typeof r.id === "string" ? r.id : null;
      const order = customId ? await db.query.orders.findFirst({ where: eq(orders.id, customId) }) : null;
      if (!order) return "unknown order";
      if (order.status === "REFUNDED") return "already refunded";
      await db.update(orders).set({ status: "REFUNDED", paypalRefundId: order.paypalRefundId ?? refundId, refundedAt: new Date(), updatedAt: new Date() }).where(eq(orders.id, order.id));
      await audit(db, { actor: "system", action: "order.refunded.webhook", entity: "order", entityId: order.id });
      return "order REFUNDED";
    }
    case "PAYMENT.PAYOUTS-ITEM.SUCCEEDED":
    case "PAYMENT.PAYOUTS-ITEM.FAILED":
    case "PAYMENT.PAYOUTS-ITEM.BLOCKED":
    case "PAYMENT.PAYOUTS-ITEM.CANCELED":
    case "PAYMENT.PAYOUTS-ITEM.DENIED":
    case "PAYMENT.PAYOUTS-ITEM.REFUNDED":
    case "PAYMENT.PAYOUTS-ITEM.RETURNED":
    case "PAYMENT.PAYOUTS-ITEM.UNCLAIMED": {
      const item = r.payout_item as { sender_item_id?: string } | undefined;
      const orderId = item?.sender_item_id;
      if (!orderId) return "no sender_item_id";
      const status = typeof r.transaction_status === "string" ? r.transaction_status : (event.event_type.split(".").pop() ?? "UNKNOWN");
      const errors = r.errors as { message?: string } | undefined;
      const updated = await db.update(orders).set({ payoutStatus: status, payoutError: errors?.message ?? null, updatedAt: new Date() }).where(eq(orders.id, orderId)).returning({ id: orders.id });
      return updated.length ? `payout ${status}` : "unknown order";
    }
    case "PAYMENT.PAYOUTSBATCH.SUCCESS":
    case "PAYMENT.PAYOUTSBATCH.DENIED":
    case "PAYMENT.PAYOUTSBATCH.PROCESSING": {
      const header = r.batch_header as { payout_batch_id?: string; batch_status?: string } | undefined;
      if (!header?.payout_batch_id) return "no batch id";
      const updated = await db
        .update(orders)
        .set({ payoutStatus: header.batch_status ?? (event.event_type.split(".").pop() ?? "UNKNOWN"), updatedAt: new Date() })
        .where(eq(orders.paypalPayoutBatchId, header.payout_batch_id))
        .returning({ id: orders.id });
      return updated.length ? `payout batch ${header.batch_status}` : "unknown batch";
    }
    case "VAULT.PAYMENT-TOKEN.CREATED":
    case "VAULT.PAYMENT-TOKEN.DELETED": {
      const tokenId = typeof r.id === "string" ? r.id : null;
      if (!tokenId) return "no token id";
      const found = await syncWalletFromWebhook(db, tokenId, event.event_type.endsWith("CREATED") ? "CREATED" : "DELETED");
      return found ? "wallet synced" : "unknown token";
    }
    default:
      return "ignored";
  }
}
