import { NextResponse } from "next/server";
import { getEnv, runHousekeeping } from "@agentshelf/core";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Reservation expiry + stale order cleanup. Called by the Render cron job (or any scheduler) with the internal secret. */
export async function POST(req: Request) {
  const env = getEnv();
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${env.INTERNAL_API_SECRET}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await runHousekeeping(await db());
  return NextResponse.json(result);
}

export const GET = POST;
