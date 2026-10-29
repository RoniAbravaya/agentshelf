import { z } from "zod";
import { addTracking, cancelPendingOrder, markCollected, rateOrder, refundOrder, unauthenticated, validation } from "@agentshelf/core";
import { handler, json, parseBody, type RouteParams } from "@/lib/api";
import { assertSameOrigin, currentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const TrackingInput = z.object({ tracking_number: z.string().trim().min(3).max(64), carrier: z.string().trim().min(2).max(32).default("OTHER") });
const RefundInput = z.object({ amount_cents: z.number().int().positive().optional(), note: z.string().trim().max(255).optional() });
const ReviewInput = z.object({ stars: z.number().int().min(1).max(5), comment: z.string().trim().max(500).optional() });

/**
 * POST /api/orders/{id}/tracking  (seller)  -> SHIPPED + tracking on the PayPal transaction
 * POST /api/orders/{id}/refund    (seller)  -> PayPal refund, order REFUNDED
 * POST /api/orders/{id}/collected (buyer)   -> PICKED_UP
 * POST /api/orders/{id}/review    (buyer)   -> rating saved, seller score updated
 * POST /api/orders/{id}/cancel    (buyer)   -> withdraw an order still awaiting PayPal approval
 */
export const POST = handler(async (req, { params }: RouteParams<{ id: string; action: string }>) => {
  await assertSameOrigin();
  const user = await currentUser();
  if (!user) throw unauthenticated();
  const { id, action } = await params;
  const database = await db();
  switch (action) {
    case "tracking": {
      const input = await parseBody(req, TrackingInput);
      const order = await addTracking(database, { orderId: id, sellerId: user.id, trackingNumber: input.tracking_number, carrier: input.carrier });
      return json({ order });
    }
    case "refund": {
      const input = await parseBody(req, RefundInput);
      const order = await refundOrder(database, { orderId: id, sellerId: user.id, amountCents: input.amount_cents, note: input.note });
      return json({ order });
    }
    case "collected": {
      const order = await markCollected(database, { orderId: id, buyerId: user.id });
      return json({ order });
    }
    case "cancel": {
      const order = await cancelPendingOrder(database, { orderId: id, buyerId: user.id });
      return json({ order });
    }
    case "review": {
      const input = await parseBody(req, ReviewInput);
      const result = await rateOrder(database, { orderId: id, buyerId: user.id, stars: input.stars, comment: input.comment });
      return json(result);
    }
    default:
      throw validation(`Unknown action ${action}`);
  }
});
