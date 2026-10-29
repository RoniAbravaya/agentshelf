import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";
import { getEnv } from "@agentshelf/core";

export async function POST() {
  await clearSessionCookie();
  return NextResponse.redirect(new URL("/", getEnv().APP_URL), { status: 303 });
}
