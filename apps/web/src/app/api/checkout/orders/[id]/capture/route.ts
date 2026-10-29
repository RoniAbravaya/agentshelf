import { captureOrder } from "@agentshelf/core";
import { handler, json, type RouteParams } from "@/lib/api";
import { assertSameOrigin } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Capture after the buyer approved in the PayPal popup. {id} is the PayPal order id. */
export const POST = handler(async (_req, { params }: RouteParams<{ id: string }>) => {
  await assertSameOrigin();
  const { id } = await params;
  const order = await captureOrder(await db(), { paypalOrderId: id });
  return json({ order: { id: order.id, status: order.status, paypal_capture_id: order.paypalCaptureId, total_cents: order.totalCents } });
});
