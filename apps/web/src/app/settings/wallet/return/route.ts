import { NextResponse } from "next/server";
import { CommerceError, confirmWalletSetup, getEnv } from "@agentshelf/core";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** PayPal sends the buyer back here after approving the Vault setup token (?approval_token_id=...). */
export async function GET(req: Request) {
  const env = getEnv();
  const user = await currentUser();
  if (!user) return NextResponse.redirect(`${env.APP_URL}/login?next=${encodeURIComponent("/settings/wallet")}`);
  const url = new URL(req.url);
  const setupTokenId = url.searchParams.get("approval_token_id") ?? url.searchParams.get("token");
  if (!setupTokenId) return NextResponse.redirect(`${env.APP_URL}/settings/wallet?error=${encodeURIComponent("Missing approval token")}`);
  try {
    await confirmWalletSetup(await db(), user.id, setupTokenId);
    return NextResponse.redirect(`${env.APP_URL}/settings/wallet?saved=1`);
  } catch (err) {
    const msg = err instanceof CommerceError ? err.message : "Could not save the wallet";
    return NextResponse.redirect(`${env.APP_URL}/settings/wallet?error=${encodeURIComponent(msg)}`);
  }
}
