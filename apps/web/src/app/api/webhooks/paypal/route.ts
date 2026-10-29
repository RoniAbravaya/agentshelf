import { NextResponse } from "next/server";
import { processWebhook, readWebhookHeaders } from "@agentshelf/core";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** PayPal webhook receiver: verifies the signature with PayPal, then processes idempotently. */
export async function POST(req: Request) {
  const raw = await req.text();
  const headers = readWebhookHeaders((name) => req.headers.get(name));
  try {
    const result = await processWebhook(await db(), headers, raw);
    const status = result.status === "rejected" ? 400 : 200;
    return NextResponse.json(result, { status });
  } catch (err) {
    console.error("webhook processing failed", err);
    // 500 makes PayPal retry; handlers are idempotent.
    return NextResponse.json({ status: "error", detail: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
