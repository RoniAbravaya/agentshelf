import { z } from "zod";
import { confirmWalletSetup, deleteWallet, startWalletSetup, unauthenticated, validation, walletView } from "@agentshelf/core";
import { handler, json, parseBody, type RouteParams } from "@/lib/api";
import { assertSameOrigin, currentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * POST /api/wallet/setup-token -> { approval_url }   (Vault v3 setup token)
 * POST /api/wallet/confirm     -> { wallet }         (exchange approved setup token for a payment token)
 * POST /api/wallet/delete      -> { wallet }
 * GET  /api/wallet/status      -> { wallet }
 */
export const POST = handler(async (req, { params }: RouteParams<{ action: string }>) => {
  await assertSameOrigin();
  const user = await currentUser();
  if (!user) throw unauthenticated();
  const { action } = await params;
  const database = await db();
  switch (action) {
    case "setup-token":
      return json(await startWalletSetup(database, user.id));
    case "confirm": {
      const input = await parseBody(req, z.object({ setup_token_id: z.string().min(3) }));
      return json({ wallet: await confirmWalletSetup(database, user.id, input.setup_token_id) });
    }
    case "delete":
      return json({ wallet: await deleteWallet(database, user.id) });
    default:
      throw validation(`Unknown action ${action}`);
  }
});

export const GET = handler(async (_req, { params }: RouteParams<{ action: string }>) => {
  const user = await currentUser();
  if (!user) throw unauthenticated();
  const { action } = await params;
  if (action !== "status") throw validation(`Unknown action ${action}`);
  return json({ wallet: await walletView(await db(), user.id) });
});
