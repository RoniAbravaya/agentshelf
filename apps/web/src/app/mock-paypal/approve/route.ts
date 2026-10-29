import { NextResponse } from "next/server";
import { MockPayPalClient, getEnv, getPayPal } from "@agentshelf/core";

export const dynamic = "force-dynamic";

/**
 * Dev-only stand-in for the PayPal approval page when no sandbox credentials are
 * configured: "approves" the mock order and sends the buyer to our return URL,
 * exactly like PayPal would (…/orders/{id}/return?token=<paypal order id>).
 */
export async function GET(req: Request) {
  const paypal = getPayPal();
  if (!(paypal instanceof MockPayPalClient)) return new Response("Not available", { status: 404 });
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) return new Response("Missing token", { status: 400 });
  const order = await paypal.approveOrder(token);
  const customId = order.purchase_units?.[0]?.custom_id ?? "";
  const env = getEnv();
  return NextResponse.redirect(`${env.APP_URL}/orders/${customId}/return?token=${encodeURIComponent(token)}&PayerID=MOCKPAYER`);
}
