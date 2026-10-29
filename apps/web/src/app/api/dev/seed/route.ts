import { NextResponse } from "next/server";
import { getEnv } from "@agentshelf/core";
import { seedDemoData } from "@agentshelf/core/seed";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Re-seed demo data while the app is running (embedded PGlite allows only one
 * process, so `pnpm db:seed` needs the server stopped; this route does not).
 * Protected by INTERNAL_API_SECRET; disabled in production unless ALLOW_SEED=true.
 */
export async function POST(req: Request) {
  const env = getEnv();
  if (env.NODE_ENV === "production" && process.env.ALLOW_SEED !== "true") return NextResponse.json({ error: "disabled in production" }, { status: 403 });
  if (req.headers.get("authorization") !== `Bearer ${env.INTERNAL_API_SECRET}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const out = await seedDemoData(await db());
  return NextResponse.json(out);
}
