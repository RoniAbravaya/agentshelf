import { eq } from "drizzle-orm";
import { decryptString, encryptString, sha256Hex } from "../crypto";
import type { Db, Tx } from "../db/client";
import { buyerWallets, type BuyerWallet } from "../db/schema";
import { getEnv } from "../env";
import { newRequestId } from "../ids";
import { getPayPal } from "../paypal/client";
import { audit } from "./audit";
import { CommerceError, notFound, validation } from "./errors";

/**
 * Buyer wallet = a PayPal payment token saved once through Vault v3.
 * The token is stored encrypted and mapped to the buyer; agents only ever hold
 * an opaque AgentShelf key. No LLM-facing code can read this table.
 */
export interface WalletView {
  status: "ACTIVE" | "MISSING" | "DELETED" | "PENDING";
  payer_email: string | null;
  paypal_customer_id: string | null;
  created_at: string | null;
}

export async function getWallet(db: Db | Tx, buyerId: string): Promise<BuyerWallet | null> {
  return (await db.query.buyerWallets.findFirst({ where: eq(buyerWallets.buyerId, buyerId) })) ?? null;
}

export async function walletView(db: Db, buyerId: string): Promise<WalletView> {
  const w = await getWallet(db, buyerId);
  if (!w) return { status: "MISSING", payer_email: null, paypal_customer_id: null, created_at: null };
  return {
    status: w.status === "ACTIVE" && w.paymentTokenEnc ? "ACTIVE" : w.status === "DELETED" ? "DELETED" : "PENDING",
    payer_email: w.payerEmail,
    paypal_customer_id: w.paypalCustomerId,
    created_at: w.createdAt.toISOString(),
  };
}

/** Step 1: create a Vault setup token and send the buyer to PayPal to approve it. */
export async function startWalletSetup(db: Db, buyerId: string): Promise<{ approval_url: string; setup_token_id: string }> {
  const paypal = getPayPal();
  if (!paypal) throw new CommerceError("PayPal is not configured", "PAYPAL_NOT_CONFIGURED");
  const env = getEnv();
  const existing = await getWallet(db, buyerId);
  const setup = await paypal.createSetupToken({
    requestId: newRequestId(),
    returnUrl: `${env.APP_URL}/settings/wallet/return`,
    cancelUrl: `${env.APP_URL}/settings/wallet?cancelled=1`,
    customerId: existing?.paypalCustomerId ?? undefined,
  });
  const approval = setup.links?.find((l) => l.rel === "approve")?.href;
  if (!approval) throw new CommerceError("PayPal did not return an approval link for the setup token", "PAYPAL", setup);
  await db
    .insert(buyerWallets)
    .values({ buyerId, setupTokenId: setup.id, paypalCustomerId: setup.customer?.id ?? null, status: "PENDING" })
    .onConflictDoUpdate({
      target: buyerWallets.buyerId,
      set: { setupTokenId: setup.id, paypalCustomerId: setup.customer?.id ?? existing?.paypalCustomerId ?? null, status: "PENDING", updatedAt: new Date() },
    });
  await audit(db, { actor: "buyer", actorId: buyerId, action: "wallet.setup_started", entity: "wallet", entityId: buyerId });
  return { approval_url: approval, setup_token_id: setup.id };
}

/** Step 2 (after the buyer approves): exchange the setup token for a permanent payment token. */
export async function confirmWalletSetup(db: Db, buyerId: string, setupTokenId: string): Promise<WalletView> {
  const paypal = getPayPal();
  if (!paypal) throw new CommerceError("PayPal is not configured", "PAYPAL_NOT_CONFIGURED");
  const wallet = await getWallet(db, buyerId);
  if (!wallet) throw notFound("wallet setup");
  // Bind the returned setup token to this buyer: never accept an arbitrary token id.
  if (wallet.setupTokenId !== setupTokenId) throw validation("This approval does not match your pending wallet setup");
  if (wallet.status === "ACTIVE" && wallet.paymentTokenEnc) return walletView(db, buyerId);

  const token = await paypal.createPaymentToken({ requestId: newRequestId(), setupTokenId });
  const payerEmail = token.payment_source?.paypal?.email_address ?? null;
  await db
    .update(buyerWallets)
    .set({
      paymentTokenEnc: encryptString(token.id),
      paymentTokenHint: sha256Hex(token.id),
      paypalCustomerId: token.customer?.id ?? wallet.paypalCustomerId,
      payerEmail,
      status: "ACTIVE",
      updatedAt: new Date(),
    })
    .where(eq(buyerWallets.buyerId, buyerId));
  await audit(db, { actor: "buyer", actorId: buyerId, action: "wallet.saved", entity: "wallet", entityId: buyerId, details: { payer_email: payerEmail } });
  return walletView(db, buyerId);
}

export async function deleteWallet(db: Db, buyerId: string): Promise<WalletView> {
  const wallet = await getWallet(db, buyerId);
  if (!wallet) return walletView(db, buyerId);
  const paypal = getPayPal();
  if (paypal && wallet.paymentTokenEnc) {
    try {
      await paypal.deletePaymentToken(decryptString(wallet.paymentTokenEnc));
    } catch (err) {
      console.error("PayPal token delete failed (continuing)", err);
    }
  }
  await db.update(buyerWallets).set({ status: "DELETED", paymentTokenEnc: null, updatedAt: new Date() }).where(eq(buyerWallets.buyerId, buyerId));
  await audit(db, { actor: "buyer", actorId: buyerId, action: "wallet.deleted", entity: "wallet", entityId: buyerId });
  return walletView(db, buyerId);
}

/** Used by Commerce core only, inside buy(). */
export function walletVaultId(wallet: BuyerWallet | null): string | null {
  if (!wallet || wallet.status !== "ACTIVE" || !wallet.paymentTokenEnc) return null;
  try {
    return decryptString(wallet.paymentTokenEnc);
  } catch {
    return null;
  }
}

/** Webhook sync: VAULT.PAYMENT-TOKEN.DELETED / CREATED. */
export async function syncWalletFromWebhook(db: Db | Tx, tokenId: string, event: "CREATED" | "DELETED"): Promise<boolean> {
  const hint = sha256Hex(tokenId);
  const w = await db.query.buyerWallets.findFirst({ where: eq(buyerWallets.paymentTokenHint, hint) });
  if (!w) return false;
  if (event === "DELETED") {
    await db.update(buyerWallets).set({ status: "DELETED", paymentTokenEnc: null, updatedAt: new Date() }).where(eq(buyerWallets.buyerId, w.buyerId));
  } else if (w.status !== "ACTIVE") {
    await db.update(buyerWallets).set({ status: "ACTIVE", updatedAt: new Date() }).where(eq(buyerWallets.buyerId, w.buyerId));
  }
  return true;
}

/** Dev/seed helper: register a wallet without PayPal (mock mode only). */
export async function seedMockWallet(db: Db, buyerId: string, payerEmail: string): Promise<void> {
  const paypal = getPayPal();
  if (!paypal || paypal.mode !== "mock") throw new Error("seedMockWallet only works with the PayPal mock");
  const setup = await paypal.createSetupToken({ requestId: newRequestId(), returnUrl: "x", cancelUrl: "x" });
  const token = await paypal.createPaymentToken({ requestId: newRequestId(), setupTokenId: setup.id });
  await db
    .insert(buyerWallets)
    .values({
      buyerId,
      setupTokenId: setup.id,
      paymentTokenEnc: encryptString(token.id),
      paymentTokenHint: sha256Hex(token.id),
      paypalCustomerId: token.customer?.id ?? null,
      payerEmail,
      status: "ACTIVE",
    })
    .onConflictDoUpdate({
      target: buyerWallets.buyerId,
      set: { paymentTokenEnc: encryptString(token.id), paymentTokenHint: sha256Hex(token.id), payerEmail, status: "ACTIVE", updatedAt: new Date() },
    });
}
