import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  PLATFORM_LIMITS,
  centsToUsdNumber,
  publicName,
  type BuyOutput,
  type Fulfillment,
  type OrderStatusOutput,
  type QuoteOutput,
} from "@agentshelf/shared";
import type { Db, Tx } from "../db/client";
import { conversations, listings, orders, quotes, reservations, sellers, users, type Listing, type Order, type Quote, type Seller } from "../db/schema";
import { getEnv } from "../env";
import { newId, newRequestId } from "../ids";
import { getPayPal, orderApprovalLink, orderCaptureId, orderPayer, orderShippingAddress, type PayPalApi } from "../paypal/client";
import { PayPalApiError, type PayPalOrder } from "../paypal/types";
import { evaluatePolicy, type PolicyListingView } from "../policy/engine";
import { audit } from "./audit";
import { getCurrentPolicy, spentThisMonthCents } from "./buyer-policy";
import { CommerceError, forbidden, notFound, validation } from "./errors";
import { expireReservations, getListingWithSeller, pickupAddressFor } from "./listings";
import { getOrCreateConversation, sendMessage } from "./messaging";
import { sellerContactForBuyer } from "./users";
import { getWallet, walletVaultId } from "./wallet";

const LIVE_STATUSES = ["PENDING_APPROVAL", "PAID", "SHIPPED", "PICKED_UP", "COMPLETED"] as const;

function requirePayPalApi(): PayPalApi {
  const p = getPayPal();
  if (!p) throw new CommerceError("PayPal is not configured on this server", "PAYPAL_NOT_CONFIGURED");
  return p;
}

function totalsFor(l: Listing, fulfillment: Fulfillment) {
  const shipping = fulfillment === "SHIP" ? (l.shippingCents ?? 0) : 0;
  return { item_cents: l.priceCents, shipping_cents: shipping, total_cents: l.priceCents + shipping };
}

function listingSnapshot(l: Listing, s: Seller) {
  return {
    title: l.title,
    description: l.description,
    category: l.category,
    condition: l.condition,
    price_cents: l.priceCents,
    photos: l.photos,
    area_label: l.areaLabel,
    seller_name: publicName(s.displayName),
    seller_payee_email: s.paypalPayeeEmail,
  };
}

/**
 * Reserve a listing for an order inside a transaction. Throws RESERVED when
 * another checkout holds it. The unique primary key on reservations.listing_id
 * makes two concurrent buyers impossible to both succeed.
 */
async function reserveListing(tx: Tx, l: Listing, orderId: string, minutes: number): Promise<void> {
  const fresh = await tx.select().from(listings).where(eq(listings.id, l.id)).for("update");
  const row = fresh[0];
  if (!row) throw notFound("listing");
  if (row.status === "RESERVED") {
    const r = await tx.query.reservations.findFirst({ where: eq(reservations.listingId, l.id) });
    if (r && r.expiresAt.getTime() > Date.now()) {
      throw new CommerceError("Another buyer is checking out this item. Try again in a few minutes.", "RESERVED");
    }
    await tx.delete(reservations).where(eq(reservations.listingId, l.id));
  } else if (row.status !== "AVAILABLE") {
    throw validation(`Item is ${row.status.toLowerCase()}, not available`);
  }
  await tx.insert(reservations).values({ listingId: l.id, orderId, expiresAt: new Date(Date.now() + minutes * 60_000) });
  await tx.update(listings).set({ status: "RESERVED", updatedAt: new Date() }).where(eq(listings.id, l.id));
}

async function releaseReservation(db: Db | Tx, listingId: string, orderId: string): Promise<void> {
  const r = await db.query.reservations.findFirst({ where: eq(reservations.listingId, listingId) });
  if (r && r.orderId !== orderId) return; // someone else holds it now
  await db.delete(reservations).where(eq(reservations.listingId, listingId));
  await db.update(listings).set({ status: "AVAILABLE", updatedAt: new Date() }).where(and(eq(listings.id, listingId), eq(listings.status, "RESERVED")));
}

// ---- Shared: mark an order paid (API response or webhook, idempotent) -------

export async function markOrderPaid(
  db: Db,
  order: Order,
  paypalOrder: PayPalOrder | null,
  captureId: string | null,
): Promise<Order> {
  const current = await db.query.orders.findFirst({ where: eq(orders.id, order.id) });
  if (!current) throw notFound("order");
  if (current.status !== "PENDING_APPROVAL") return current; // already handled
  const payer = paypalOrder ? orderPayer(paypalOrder) : { name: null, email: null };
  const address = paypalOrder ? orderShippingAddress(paypalOrder) : null;
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(orders)
      .set({
        status: "PAID",
        paypalCaptureId: captureId ?? current.paypalCaptureId,
        paypalOrderId: paypalOrder?.id ?? current.paypalOrderId,
        buyerName: current.buyerName ?? payer.name,
        buyerEmail: current.buyerEmail ?? payer.email,
        shippingAddress: current.shippingAddress ?? address,
        approvalUrl: null,
        paidAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(orders.id, order.id), eq(orders.status, "PENDING_APPROVAL")))
      .returning();
    if (!row) return null;
    await tx.delete(reservations).where(eq(reservations.listingId, current.listingId));
    await tx.update(listings).set({ status: "SOLD", soldAt: new Date(), updatedAt: new Date() }).where(eq(listings.id, current.listingId));
    await tx.update(sellers).set({ itemsSold: sql`${sellers.itemsSold} + 1` }).where(eq(sellers.userId, current.sellerId));
    await audit(tx, { actor: "system", action: "order.paid", entity: "order", entityId: order.id, details: { capture_id: captureId, channel: current.channel } });
    return row;
  });
  if (!updated) return (await db.query.orders.findFirst({ where: eq(orders.id, order.id) }))!;
  // Open the buyer-seller chat with a system note so pickup/shipping can be arranged.
  if (updated.buyerId) {
    try {
      const conv = await getOrCreateConversation(db, updated.listingId, updated.buyerId);
      await db.update(orders).set({ updatedAt: new Date() }).where(eq(orders.id, updated.id));
      if (!conv.orderId) await db.update(conversations).set({ orderId: updated.id }).where(eq(conversations.id, conv.id));
      const note =
        updated.fulfillment === "PICKUP"
          ? `Paid ${fmt(updated.totalCents)} via PayPal. Agree a pickup time here; the exact address is on the order page.`
          : `Paid ${fmt(updated.totalCents)} via PayPal including shipping. Tracking will appear on the order once the seller ships.`;
      await sendMessage(db, { conversationId: conv.id, senderUserId: updated.buyerId, sender: updated.channel === "AGENT" ? "buyer_agent" : "buyer", body: note });
    } catch (err) {
      console.error("post-payment conversation failed", err);
    }
  }
  return updated;
}

function fmt(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

async function failOrder(db: Db, order: Order, reason: string): Promise<Order> {
  const [row] = await db
    .update(orders)
    .set({ status: "FAILED", failureReason: reason.slice(0, 500), updatedAt: new Date() })
    .where(and(eq(orders.id, order.id), eq(orders.status, "PENDING_APPROVAL")))
    .returning();
  await releaseReservation(db, order.listingId, order.id);
  await audit(db, { actor: "system", action: "order.failed", entity: "order", entityId: order.id, details: { reason } });
  return row ?? order;
}

// ---- Flow A: human buyer checkout ------------------------------------------

export interface WebCheckoutInput {
  listingId: string;
  fulfillment: Fulfillment;
  buyerId?: string | null;
}

export async function createWebCheckout(db: Db, input: WebCheckoutInput): Promise<{ order: Order; paypal_order_id: string; approval_url: string | null }> {
  const paypal = requirePayPalApi();
  await expireReservations(db);
  const pair = await getListingWithSeller(db, input.listingId);
  if (!pair || pair.listing.status === "REMOVED" || pair.listing.status === "DRAFT") throw notFound("listing");
  const { listing: l, seller: s } = pair;
  if (input.buyerId && input.buyerId === l.sellerId) throw validation("You cannot buy your own listing");
  if (input.fulfillment === "PICKUP" && !l.pickupEnabled) throw validation("Seller does not offer local pickup");
  if (input.fulfillment === "SHIP" && !l.shippingEnabled) throw validation("Seller does not offer shipping");
  const totals = totalsFor(l, input.fulfillment);
  const orderId = newId("order");
  const requestId = newRequestId();

  const order = await db.transaction(async (tx) => {
    await reserveListing(tx, l, orderId, PLATFORM_LIMITS.reservationMinutes);
    const [row] = await tx
      .insert(orders)
      .values({
        id: orderId,
        listingId: l.id,
        sellerId: s.userId,
        buyerId: input.buyerId ?? null,
        channel: "WEB",
        fulfillment: input.fulfillment,
        status: "PENDING_APPROVAL",
        itemCents: totals.item_cents,
        shippingCents: totals.shipping_cents,
        totalCents: totals.total_cents,
        requestId,
        listingSnapshot: listingSnapshot(l, s),
      })
      .returning();
    await audit(tx, { actor: "buyer", actorId: input.buyerId ?? null, action: "order.create", entity: "order", entityId: orderId, details: { channel: "WEB", fulfillment: input.fulfillment } });
    return row!;
  });

  const env = getEnv();
  try {
    const pp = await paypal.createOrder({
      requestId,
      referenceId: l.id,
      customId: orderId,
      description: l.title,
      payeeEmail: s.paypalPayeeEmail,
      itemCents: totals.item_cents,
      shippingCents: totals.shipping_cents,
      needsShippingAddress: input.fulfillment === "SHIP",
      returnUrl: `${env.APP_URL}/orders/${orderId}/return`,
      cancelUrl: `${env.APP_URL}/listings/${l.id}?cancelled=1`,
    });
    const approval = orderApprovalLink(pp);
    const [row] = await db.update(orders).set({ paypalOrderId: pp.id, approvalUrl: approval, updatedAt: new Date() }).where(eq(orders.id, orderId)).returning();
    return { order: row!, paypal_order_id: pp.id, approval_url: approval };
  } catch (err) {
    await failOrder(db, order, err instanceof Error ? err.message : "PayPal order creation failed");
    throw err instanceof PayPalApiError ? new CommerceError(`PayPal rejected the order: ${err.message}`, "PAYPAL", err.body) : err;
  }
}

/** Capture after the buyer approved in the PayPal popup (or via the return URL / webhook). */
export async function captureOrder(db: Db, lookup: { orderId?: string; paypalOrderId?: string }): Promise<Order> {
  const paypal = requirePayPalApi();
  const order = lookup.orderId
    ? await db.query.orders.findFirst({ where: eq(orders.id, lookup.orderId) })
    : await db.query.orders.findFirst({ where: eq(orders.paypalOrderId, lookup.paypalOrderId ?? "") });
  if (!order || !order.paypalOrderId) throw notFound("order");
  if (order.status !== "PENDING_APPROVAL") return order;

  // The item may have been released and sold elsewhere while approval was pending.
  const l = await db.query.listings.findFirst({ where: eq(listings.id, order.listingId) });
  if (!l) throw notFound("listing");
  const r = await db.query.reservations.findFirst({ where: eq(reservations.listingId, l.id) });
  const heldByUs = r?.orderId === order.id;
  if (!heldByUs) {
    if (l.status === "AVAILABLE" || (l.status === "RESERVED" && r && r.expiresAt.getTime() < Date.now())) {
      await db.transaction(async (tx) => reserveListing(tx, l, order.id, 5));
    } else {
      return failOrder(db, order, "Item is no longer available");
    }
  }

  let pp: PayPalOrder;
  try {
    pp = await paypal.captureOrder(order.paypalOrderId, `${order.requestId}-capture`);
  } catch (err) {
    if (err instanceof PayPalApiError && err.issues.some((i) => i.issue === "ORDER_ALREADY_CAPTURED")) {
      pp = await paypal.getOrder(order.paypalOrderId);
    } else if (err instanceof PayPalApiError && err.issues.some((i) => i.issue === "ORDER_NOT_APPROVED")) {
      throw new CommerceError("The buyer has not approved this payment yet", "PAYPAL", err.body);
    } else {
      throw err instanceof PayPalApiError ? new CommerceError(`PayPal capture failed: ${err.message}`, "PAYPAL", err.body) : err;
    }
  }
  return settleFromPayPalOrder(db, order, pp);
}

/** Interpret a PayPal order response and move our order forward (idempotent). */
async function settleFromPayPalOrder(db: Db, order: Order, pp: PayPalOrder): Promise<Order> {
  const capture = pp.purchase_units?.[0]?.payments?.captures?.[0];
  if (pp.status === "COMPLETED" && capture && (capture.status === "COMPLETED" || capture.status === "PENDING")) {
    return markOrderPaid(db, order, pp, capture.id);
  }
  if (capture && (capture.status === "DECLINED" || capture.status === "FAILED")) {
    return failOrder(db, order, `PayPal capture ${capture.status.toLowerCase()}`);
  }
  if (pp.status === "PAYER_ACTION_REQUIRED" || pp.status === "CREATED") {
    const approval = orderApprovalLink(pp);
    const [row] = await db.update(orders).set({ approvalUrl: approval, updatedAt: new Date() }).where(eq(orders.id, order.id)).returning();
    return row ?? order;
  }
  return order;
}

// ---- Flow C: agent purchase (quote -> buy) -----------------------------------

function policyListingView(l: Listing, s: Seller): PolicyListingView {
  return {
    listing_id: l.id,
    status: l.status,
    title: l.title,
    category: l.category,
    price_cents: l.priceCents,
    geo: l.geoLat != null && l.geoLng != null ? { lat: l.geoLat, lng: l.geoLng } : null,
    pickup_enabled: l.pickupEnabled,
    shipping_enabled: l.shippingEnabled,
    shipping_cents: l.shippingCents,
    seller_rating: s.ratingAvg,
    seller_review_count: s.reviewCount,
    seller_id: s.userId,
  };
}

async function hasLiveOrder(db: Db | Tx, buyerId: string, listingId: string): Promise<boolean> {
  const row = await db.query.orders.findFirst({
    where: and(eq(orders.buyerId, buyerId), eq(orders.listingId, listingId), inArray(orders.status, [...LIVE_STATUSES])),
  });
  return Boolean(row);
}

export async function quotePurchase(db: Db, input: { buyerId: string; listingId: string; fulfillment: Fulfillment }): Promise<QuoteOutput> {
  await expireReservations(db);
  const pair = await getListingWithSeller(db, input.listingId);
  if (!pair || pair.listing.status === "REMOVED" || pair.listing.status === "DRAFT") throw notFound("listing");
  const { listing: l, seller: s } = pair;
  const [policy, spent, wallet, duplicate] = await Promise.all([
    getCurrentPolicy(db, input.buyerId),
    spentThisMonthCents(db, input.buyerId),
    getWallet(db, input.buyerId),
    hasLiveOrder(db, input.buyerId, input.listingId),
  ]);
  const decision = evaluatePolicy({
    policy: policy?.policy ?? null,
    listing: policyListingView(l, s),
    fulfillment: input.fulfillment,
    spent_this_month_cents: spent,
    wallet_status: wallet?.status === "ACTIVE" && wallet.paymentTokenEnc ? "ACTIVE" : wallet?.status === "DELETED" ? "DELETED" : wallet ? "PENDING" : "MISSING",
    buyer_id: input.buyerId,
    duplicate_order: duplicate,
  });
  const totals = totalsFor(l, input.fulfillment);
  const expiresAt = new Date(Date.now() + PLATFORM_LIMITS.quoteMinutes * 60_000);
  const [q] = await db
    .insert(quotes)
    .values({
      id: newId("quote"),
      buyerId: input.buyerId,
      listingId: l.id,
      fulfillment: input.fulfillment,
      itemCents: totals.item_cents,
      shippingCents: totals.shipping_cents,
      totalCents: totals.total_cents,
      policyResult: decision.result,
      policyReasons: decision.reasons,
      policyVersion: policy?.version ?? null,
      expiresAt,
    })
    .returning();
  await audit(db, { actor: "agent", actorId: input.buyerId, action: "quote.create", entity: "quote", entityId: q!.id, details: { result: decision.result, total_cents: totals.total_cents } });
  return {
    quote_id: q!.id,
    listing_id: l.id,
    title: l.title,
    seller: publicName(s.displayName),
    fulfillment: input.fulfillment,
    item_cents: totals.item_cents,
    shipping_cents: totals.shipping_cents,
    total_cents: totals.total_cents,
    total_usd: centsToUsdNumber(totals.total_cents),
    expires_at: expiresAt.toISOString(),
    policy_result: decision.result,
    policy_reasons: decision.reasons,
    remaining_monthly_cents: decision.remaining_monthly_cents,
  };
}

export async function buy(db: Db, input: { buyerId: string; quoteId: string }): Promise<BuyOutput> {
  const paypal = requirePayPalApi();
  const env = getEnv();
  const quote = await db.query.quotes.findFirst({ where: eq(quotes.id, input.quoteId) });
  if (!quote || quote.buyerId !== input.buyerId) throw notFound("quote");

  // Retry with the same quote returns the same order (never a second PayPal order).
  if (quote.usedAt && quote.orderId) {
    const existing = await db.query.orders.findFirst({ where: eq(orders.id, quote.orderId) });
    if (existing) return buyOutputFor(db, existing, "Quote already used; returning the existing order.");
  }

  await expireReservations(db);
  const pair = await getListingWithSeller(db, quote.listingId);
  if (!pair) throw notFound("listing");
  const { seller: s } = pair;

  // Atomic re-check + reservation + quote consumption.
  const created = await db.transaction(async (tx) => {
    const [l] = await tx.select().from(listings).where(eq(listings.id, quote.listingId)).for("update");
    if (!l) throw notFound("listing");
    const [policy, spent, wallet, duplicate] = await Promise.all([
      getCurrentPolicy(tx, input.buyerId),
      spentThisMonthCents(tx, input.buyerId),
      getWallet(tx, input.buyerId),
      hasLiveOrder(tx, input.buyerId, l.id),
    ]);
    const reserved = l.status === "RESERVED" ? await tx.query.reservations.findFirst({ where: eq(reservations.listingId, l.id) }) : null;
    const effectiveStatus = l.status === "RESERVED" && reserved && reserved.expiresAt.getTime() < Date.now() ? "AVAILABLE" : l.status;
    const decision = evaluatePolicy({
      policy: policy?.policy ?? null,
      listing: { ...policyListingView(l, s), status: effectiveStatus },
      fulfillment: quote.fulfillment as Fulfillment,
      spent_this_month_cents: spent,
      wallet_status: wallet?.status === "ACTIVE" && wallet.paymentTokenEnc ? "ACTIVE" : wallet?.status === "DELETED" ? "DELETED" : wallet ? "PENDING" : "MISSING",
      buyer_id: input.buyerId,
      quote: { expires_at: quote.expiresAt, used_at: quote.usedAt },
      duplicate_order: duplicate,
    });
    // Price drift: the quote must match the listing exactly.
    const totals = totalsFor(l, quote.fulfillment as Fulfillment);
    if (totals.total_cents !== quote.totalCents) {
      decision.result = "BLOCKED";
      decision.reasons.push("The price changed since the quote was issued. Request a new quote.");
    }
    if (decision.result === "BLOCKED") {
      await audit(tx, { actor: "agent", actorId: input.buyerId, action: "buy.blocked", entity: "quote", entityId: quote.id, details: decision });
      return { kind: "blocked" as const, decision };
    }
    const orderId = newId("order");
    await reserveListing(tx, l, orderId, decision.result === "AUTO" ? PLATFORM_LIMITS.reservationMinutes : 30);
    const [order] = await tx
      .insert(orders)
      .values({
        id: orderId,
        listingId: l.id,
        sellerId: s.userId,
        buyerId: input.buyerId,
        channel: "AGENT",
        fulfillment: quote.fulfillment,
        status: "PENDING_APPROVAL",
        itemCents: totals.item_cents,
        shippingCents: totals.shipping_cents,
        totalCents: totals.total_cents,
        requestId: newRequestId(),
        quoteId: quote.id,
        policyResult: decision.result,
        listingSnapshot: listingSnapshot(l, s),
      })
      .returning();
    await tx.update(quotes).set({ usedAt: new Date(), orderId }).where(eq(quotes.id, quote.id));
    await audit(tx, { actor: "agent", actorId: input.buyerId, action: "order.create", entity: "order", entityId: orderId, details: { channel: "AGENT", policy: decision.result } });
    return { kind: "created" as const, order: order!, decision, listing: l, vaultId: walletVaultId(wallet) };
  });

  if (created.kind === "blocked") {
    return { order_id: null, status: "REJECTED", approval_url: null, reason: created.decision.reasons.join(" "), receipt: null };
  }
  const { order, decision, listing: l, vaultId } = created;
  const payee = env.PAYPAL_AGENT_PAYEE_MODE === "platform" ? null : s.paypalPayeeEmail;
  const common = {
    referenceId: l.id,
    customId: order.id,
    description: l.title,
    payeeEmail: payee ?? "",
    itemCents: order.itemCents,
    shippingCents: order.shippingCents,
    needsShippingAddress: order.fulfillment === "SHIP",
    returnUrl: `${env.APP_URL}/orders/${order.id}/return`,
    cancelUrl: `${env.APP_URL}/orders/${order.id}?cancelled=1`,
  };

  // AUTO: pay with the saved wallet, no redirect.
  if (decision.result === "AUTO" && vaultId) {
    try {
      const pp = await paypal.createOrder({ ...common, requestId: order.requestId, vaultId });
      await db.update(orders).set({ paypalOrderId: pp.id, updatedAt: new Date() }).where(eq(orders.id, order.id));
      let settled = await settleFromPayPalOrder(db, { ...order, paypalOrderId: pp.id }, pp);
      if (settled.status === "PENDING_APPROVAL" && pp.status === "APPROVED") {
        const captured = await paypal.captureOrder(pp.id, `${order.requestId}-capture`);
        settled = await settleFromPayPalOrder(db, settled, captured);
      }
      if (settled.status === "PENDING_APPROVAL" && !settled.approvalUrl) {
        // Vaulted order neither completed nor gave a payer action: fall back to the approval link path.
        return approvalLinkPath(db, paypal, settled, common, "vaulted order did not complete");
      }
      return buyOutputFor(db, settled);
    } catch (err) {
      if (err instanceof PayPalApiError) {
        // vault_id + different payee rejected, token invalid, etc. -> one-tap approval fallback.
        const issues = err.issues.map((i) => `${i.issue ?? "?"}: ${i.description ?? ""}`).join(" | ");
        console.error("vaulted agent order failed; falling back to approval link", err.message, issues, "debug_id", err.debugId);
        return approvalLinkPath(db, paypal, order, common, `vault payment rejected: ${err.code ?? err.status} ${issues}`.trim());
      }
      await failOrder(db, order, err instanceof Error ? err.message : "payment failed");
      throw err;
    }
  }

  // NEEDS_APPROVAL (or no usable vault token): standard order with a one-tap approval link.
  return approvalLinkPath(db, paypal, order, common, decision.result === "AUTO" ? "no active wallet token" : "approval threshold");
}

async function approvalLinkPath(
  db: Db,
  paypal: PayPalApi,
  order: Order,
  common: Omit<Parameters<PayPalApi["createOrder"]>[0], "requestId" | "vaultId">,
  why: string,
): Promise<BuyOutput> {
  try {
    const pp = await paypal.createOrder({ ...common, requestId: `${order.requestId}-approval` });
    const approval = orderApprovalLink(pp);
    const [row] = await db
      .update(orders)
      .set({ paypalOrderId: pp.id, approvalUrl: approval, policyResult: "NEEDS_APPROVAL", updatedAt: new Date() })
      .where(eq(orders.id, order.id))
      .returning();
    await audit(db, { actor: "system", action: "order.needs_approval", entity: "order", entityId: order.id, details: { why } });
    return buyOutputFor(db, row ?? order);
  } catch (err) {
    const failed = await failOrder(db, order, err instanceof Error ? err.message : "PayPal order creation failed");
    return buyOutputFor(db, failed, err instanceof Error ? err.message : "PayPal order creation failed");
  }
}

async function buyOutputFor(db: Db, order: Order, reason: string | null = null): Promise<BuyOutput> {
  const status: BuyOutput["status"] =
    order.status === "PENDING_APPROVAL" ? "NEEDS_APPROVAL" : ["PAID", "SHIPPED", "PICKED_UP", "COMPLETED"].includes(order.status) ? "COMPLETED" : "REJECTED";
  if (status === "REJECTED") {
    return { order_id: order.id, status, approval_url: null, reason: reason ?? order.failureReason ?? `Order ${order.status.toLowerCase()}`, receipt: null };
  }
  const pair = await getListingWithSeller(db, order.listingId);
  const remaining = await remainingMonthly(db, order.buyerId);
  const conv = order.buyerId
    ? await db.query.conversations.findFirst({ where: and(eq(conversations.listingId, order.listingId), eq(conversations.buyerId, order.buyerId)) })
    : null;
  return {
    order_id: order.id,
    status,
    approval_url: status === "NEEDS_APPROVAL" ? order.approvalUrl : null,
    reason: status === "NEEDS_APPROVAL" ? (reason ?? "Buyer approval required: open approval_url to confirm in PayPal.") : reason,
    receipt:
      status === "COMPLETED" && order.paypalOrderId
        ? {
            paypal_order_id: order.paypalOrderId,
            paypal_capture_id: order.paypalCaptureId,
            total_cents: order.totalCents,
            total_usd: centsToUsdNumber(order.totalCents),
            seller: pair ? publicName(pair.seller.displayName) : "",
            fulfillment: order.fulfillment as Fulfillment,
            pickup_address: order.fulfillment === "PICKUP" && pair ? pickupAddressFor(pair.listing) : null,
            conversation_id: conv?.id ?? null,
            remaining_monthly_cents: remaining,
          }
        : null,
  };
}

async function remainingMonthly(db: Db, buyerId: string | null): Promise<number> {
  if (!buyerId) return 0;
  const policy = await getCurrentPolicy(db, buyerId);
  if (!policy) return 0;
  const spent = await spentThisMonthCents(db, buyerId);
  return Math.max(0, policy.policy.monthly_cap_cents - spent);
}

// ---- Reads ------------------------------------------------------------------

export async function orderStatusForBuyer(db: Db, orderId: string, buyerId: string): Promise<OrderStatusOutput> {
  const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
  if (!order) throw notFound("order");
  if (order.buyerId !== buyerId) throw forbidden("Not your order");
  return orderStatusView(db, order);
}

export async function orderStatusView(db: Db, order: Order): Promise<OrderStatusOutput> {
  const pair = await getListingWithSeller(db, order.listingId);
  const paid = ["PAID", "SHIPPED", "PICKED_UP", "COMPLETED", "REFUNDED"].includes(order.status);
  const conv = order.buyerId
    ? await db.query.conversations.findFirst({ where: and(eq(conversations.listingId, order.listingId), eq(conversations.buyerId, order.buyerId)) })
    : null;
  return {
    order_id: order.id,
    status: order.status as OrderStatusOutput["status"],
    listing_id: order.listingId,
    title: (order.listingSnapshot as { title?: string } | null)?.title ?? pair?.listing.title ?? "",
    fulfillment: order.fulfillment as Fulfillment,
    total_cents: order.totalCents,
    paypal_order_id: order.paypalOrderId,
    paypal_capture_id: order.paypalCaptureId,
    approval_url: order.status === "PENDING_APPROVAL" ? order.approvalUrl : null,
    tracking_number: order.trackingNumber,
    carrier: order.carrier,
    pickup_address: paid && order.fulfillment === "PICKUP" && pair ? pickupAddressFor(pair.listing) : null,
    conversation_id: conv?.id ?? null,
    created_at: order.createdAt.toISOString(),
  };
}

export async function listOrdersForBuyer(db: Db, buyerId: string, limit = 10): Promise<OrderStatusOutput[]> {
  const rows = await db.query.orders.findMany({ where: eq(orders.buyerId, buyerId), orderBy: [desc(orders.createdAt)], limit });
  return Promise.all(rows.map((o) => orderStatusView(db, o)));
}

export async function listOrdersForSeller(db: Db, sellerId: string, limit = 50): Promise<Order[]> {
  return db.query.orders.findMany({
    where: and(eq(orders.sellerId, sellerId), inArray(orders.status, ["PAID", "SHIPPED", "PICKED_UP", "COMPLETED", "REFUNDED"])),
    orderBy: [desc(orders.createdAt)],
    limit,
  });
}

export async function getOrderForUser(db: Db, orderId: string, userId: string): Promise<{ order: Order; role: "buyer" | "seller"; listing: Listing | null; seller: Seller | null; buyer_name: string | null; seller_contact: { phone: string | null } }> {
  const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
  if (!order) throw notFound("order");
  const role = order.sellerId === userId ? "seller" : order.buyerId === userId ? "buyer" : null;
  if (!role) throw forbidden("Not your order");
  const pair = await getListingWithSeller(db, order.listingId);
  const buyer = order.buyerId ? await db.query.users.findFirst({ where: eq(users.id, order.buyerId) }) : null;
  const paid = ["PAID", "SHIPPED", "PICKED_UP", "COMPLETED"].includes(order.status);
  return {
    order,
    role,
    listing: pair?.listing ?? null,
    seller: pair?.seller ?? null,
    buyer_name: buyer?.displayName ?? order.buyerName,
    seller_contact: role === "buyer" && paid && pair ? sellerContactForBuyer(pair.seller) : { phone: null },
  };
}

// ---- Fulfilment: tracking, pickup confirmation, refunds ----------------------

export async function addTracking(db: Db, input: { orderId: string; sellerId: string; trackingNumber: string; carrier: string }): Promise<Order> {
  const order = await db.query.orders.findFirst({ where: eq(orders.id, input.orderId) });
  if (!order) throw notFound("order");
  if (order.sellerId !== input.sellerId) throw forbidden("Not your order");
  if (order.fulfillment !== "SHIP") throw validation("Tracking applies to shipped orders only");
  if (!["PAID", "SHIPPED"].includes(order.status)) throw validation(`Order is ${order.status}`);
  const tracking = input.trackingNumber.trim();
  if (!tracking) throw validation("Tracking number is required");
  const paypal = getPayPal();
  if (paypal && order.paypalOrderId && order.paypalCaptureId) {
    try {
      await paypal.addTracking({ orderId: order.paypalOrderId, captureId: order.paypalCaptureId, trackingNumber: tracking, carrier: input.carrier, notifyPayer: true });
    } catch (err) {
      console.error("PayPal tracking update failed (order still marked shipped)", err);
    }
  }
  const [row] = await db
    .update(orders)
    .set({ status: "SHIPPED", trackingNumber: tracking, carrier: input.carrier.trim().toUpperCase(), updatedAt: new Date() })
    .where(eq(orders.id, order.id))
    .returning();
  await audit(db, { actor: "seller", actorId: input.sellerId, action: "order.shipped", entity: "order", entityId: order.id, details: { carrier: input.carrier } });
  return row!;
}

export async function markCollected(db: Db, input: { orderId: string; buyerId: string }): Promise<Order> {
  const order = await db.query.orders.findFirst({ where: eq(orders.id, input.orderId) });
  if (!order) throw notFound("order");
  if (order.buyerId !== input.buyerId) throw forbidden("Not your order");
  if (order.fulfillment !== "PICKUP" || order.status !== "PAID") throw validation(`Order is ${order.status}`);
  const [row] = await db.update(orders).set({ status: "PICKED_UP", collectedAt: new Date(), updatedAt: new Date() }).where(eq(orders.id, order.id)).returning();
  await audit(db, { actor: "buyer", actorId: input.buyerId, action: "order.collected", entity: "order", entityId: order.id });
  return row!;
}

/** A buyer withdraws an order that is still waiting for PayPal approval: releases the item and the budget. */
export async function cancelPendingOrder(db: Db, input: { orderId: string; buyerId: string }): Promise<Order> {
  const order = await db.query.orders.findFirst({ where: eq(orders.id, input.orderId) });
  if (!order) throw notFound("order");
  if (order.buyerId !== input.buyerId) throw forbidden("Not your order");
  if (order.status !== "PENDING_APPROVAL") throw validation(`Order is ${order.status}; only orders awaiting approval can be cancelled`);
  const [row] = await db
    .update(orders)
    .set({ status: "CANCELLED", failureReason: "Cancelled by the buyer before approval", approvalUrl: null, updatedAt: new Date() })
    .where(and(eq(orders.id, order.id), eq(orders.status, "PENDING_APPROVAL")))
    .returning();
  await releaseReservation(db, order.listingId, order.id);
  await audit(db, { actor: "buyer", actorId: input.buyerId, action: "order.cancelled", entity: "order", entityId: order.id });
  return row ?? order;
}

export async function refundOrder(db: Db, input: { orderId: string; sellerId: string; amountCents?: number; note?: string }): Promise<Order> {
  const paypal = requirePayPalApi();
  const order = await db.query.orders.findFirst({ where: eq(orders.id, input.orderId) });
  if (!order) throw notFound("order");
  if (order.sellerId !== input.sellerId) throw forbidden("Not your order");
  if (!["PAID", "SHIPPED", "PICKED_UP", "COMPLETED"].includes(order.status)) throw validation(`Order is ${order.status}; nothing to refund`);
  if (!order.paypalCaptureId) throw validation("Order has no PayPal capture to refund");
  if (input.amountCents != null && (input.amountCents <= 0 || input.amountCents > order.totalCents)) throw validation("Refund amount out of range");
  let refund;
  try {
    refund = await paypal.refundCapture({ captureId: order.paypalCaptureId, requestId: `${order.requestId}-refund`, amountCents: input.amountCents, note: input.note });
  } catch (err) {
    throw err instanceof PayPalApiError ? new CommerceError(`PayPal refund failed: ${err.message}`, "PAYPAL", err.body) : err;
  }
  const [row] = await db
    .update(orders)
    .set({ status: "REFUNDED", paypalRefundId: refund.id, refundedAt: new Date(), updatedAt: new Date() })
    .where(eq(orders.id, order.id))
    .returning();
  await audit(db, { actor: "seller", actorId: input.sellerId, action: "order.refunded", entity: "order", entityId: order.id, details: { refund_id: refund.id, amount_cents: input.amountCents ?? order.totalCents } });
  return row!;
}

/** Housekeeping for a cron route: expire reservations and cancel stale pending orders. */
export async function runHousekeeping(db: Db): Promise<{ released: number; cancelled: number }> {
  const released = await expireReservations(db);
  const stale = await db
    .update(orders)
    .set({ status: "CANCELLED", updatedAt: new Date(), failureReason: "Not approved in time" })
    .where(
      and(
        eq(orders.status, "PENDING_APPROVAL"),
        sql`${orders.createdAt} < now() - interval '24 hours'`,
      ),
    )
    .returning({ id: orders.id });
  const webStale = await db
    .update(orders)
    .set({ status: "CANCELLED", updatedAt: new Date(), failureReason: "Checkout abandoned" })
    .where(and(eq(orders.status, "PENDING_APPROVAL"), eq(orders.channel, "WEB"), sql`${orders.createdAt} < now() - interval '30 minutes'`))
    .returning({ id: orders.id });
  return { released, cancelled: stale.length + webStale.length };
}

export type { Quote };
