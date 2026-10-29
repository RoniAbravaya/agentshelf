import Link from "next/link";
import { getSeller } from "@agentshelf/core";
import { SellerSettingsForm } from "@/components/seller-settings-form";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser("/settings");
  const seller = await getSeller(await db(), user.id);
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Settings</h1>
        <Link href="/settings/wallet" className="btn-secondary">
          Agent wallet & spending rules →
        </Link>
      </div>
      <section className="card space-y-1 p-5">
        <h2 className="font-semibold">Selling</h2>
        <p className="text-sm text-slate-500">Buyers pay the PayPal account below directly. Contact details stay hidden unless you choose to share them after purchase.</p>
        <SellerSettingsForm
          initial={{
            display_name: seller?.displayName ?? user.displayName,
            paypal_payee_email: seller?.paypalPayeeEmail ?? user.email,
            has_phone: Boolean(seller?.contactPhoneEnc),
            share_contact_after_purchase: seller?.shareContactAfterPurchase ?? false,
            bio: seller?.bio ?? "",
          }}
        />
      </section>
    </div>
  );
}
