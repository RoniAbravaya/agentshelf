import { z } from "zod";
import { createWebCheckout } from "@agentshelf/core";
import { handler, json, parseBody } from "@/lib/api";
import { assertSameOrigin, currentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const Input = z.object({ listing_id: z.string(), fulfillment: z.enum(["PICKUP", "SHIP"]) });

/** Reserve the item (10 min) and create the PayPal order with the seller as payee. */
export const POST = handler(async (req) => {
  await assertSameOrigin();
  const input = await parseBody(req, Input);
  const user = await currentUser();
  const result = await createWebCheckout(await db(), { listingId: input.listing_id, fulfillment: input.fulfillment, buyerId: user?.id ?? null });
  return json({ order_id: result.order.id, paypal_order_id: result.paypal_order_id, approval_url: result.approval_url });
});
