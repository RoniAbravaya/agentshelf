import { getSeller } from "@agentshelf/core";
import { SellerSettingsForm } from "@/components/seller-settings-form";
import { SettingsNav } from "@/components/settings-nav";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser("/settings");
  const seller = await getSeller(await db(), user.id);
  return (
    <div className="flex flex-wrap items-start gap-6">
      <SettingsNav current="selling" />
      <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-5">
        <div>
          <h1 className="font-display text-[26px] font-extrabold md:text-[32px]">Selling &amp; payouts</h1>
          <p className="mt-1 text-sm text-ink-2">Buyers pay the PayPal account below directly. Contact details stay hidden unless you choose to share them after purchase.</p>
        </div>
        <section className="card p-5">
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
        <form action="/api/auth/logout" method="post" className="md:hidden">
          <button className="btn-secondary w-full" type="submit">
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
