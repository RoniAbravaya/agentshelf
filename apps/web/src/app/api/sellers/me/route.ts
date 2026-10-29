import { SellerSettingsInput, unauthenticated, updateSellerSettings } from "@agentshelf/core";
import { handler, json, parseBody } from "@/lib/api";
import { assertSameOrigin, currentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export const PUT = handler(async (req) => {
  await assertSameOrigin();
  const user = await currentUser();
  if (!user) throw unauthenticated();
  const input = await parseBody(req, SellerSettingsInput);
  const seller = await updateSellerSettings(await db(), user.id, input);
  return json({ seller: { display_name: seller.displayName, paypal_payee_email: seller.paypalPayeeEmail, share_contact_after_purchase: seller.shareContactAfterPurchase } });
});
