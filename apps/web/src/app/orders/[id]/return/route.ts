import { NextResponse } from "next/server";
import { CommerceError, captureOrder, getEnv } from "@agentshelf/core";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * PayPal return URL (approval-link flows: agent NEEDS_APPROVAL orders, redirect
 * checkouts, and the local mock). PayPal appends ?token=<paypal order id>.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const env = getEnv();
  const token = new URL(req.url).searchParams.get("token");
  try {
    const order = token ? await captureOrder(await db(), { paypalOrderId: token }) : await captureOrder(await db(), { orderId: id });
    const flag = order.status === "PAID" ? "paid=1" : `status=${order.status.toLowerCase()}`;
    return NextResponse.redirect(`${env.APP_URL}/orders/${order.id}?${flag}`);
  } catch (err) {
    const msg = err instanceof CommerceError ? err.message : "Payment could not be completed";
    return NextResponse.redirect(`${env.APP_URL}/orders/${id}?error=${encodeURIComponent(msg)}`);
  }
}
