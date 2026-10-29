import { NextResponse } from "next/server";
import { MockPayPalClient, getPayPal } from "@agentshelf/core";

export const dynamic = "force-dynamic";

/** Dev-only stand-in for the PayPal "save wallet" approval page. */
export async function GET(req: Request) {
  const paypal = getPayPal();
  if (!(paypal instanceof MockPayPalClient)) return new Response("Not available", { status: 404 });
  const url = new URL(req.url);
  const id = url.searchParams.get("approval_token_id");
  const ret = url.searchParams.get("return");
  if (!id || !ret) return new Response("Missing parameters", { status: 400 });
  await paypal.approveSetupToken(id);
  const target = new URL(ret);
  target.searchParams.set("approval_token_id", id);
  return NextResponse.redirect(target.toString());
}
