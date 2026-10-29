import { availableAiProviders, getSeller } from "@agentshelf/core";
import { UploadForm } from "@/components/upload-form";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata = { title: "Sell an item" };

export default async function SellPage() {
  const user = await requireUser("/sell");
  const seller = await getSeller(await db(), user.id);
  const providers = availableAiProviders();
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Sell an item</h1>
        <p className="text-sm text-slate-600">Add 1-4 photos: front, back, details and any flaws. AI writes the listing; you confirm the price and delivery.</p>
      </div>
      <UploadForm providers={providers} defaultZip={seller?.userId ? "" : ""} />
      <p className="text-xs text-slate-500">Photos with people, ID documents or prohibited items are rejected before anything is published.</p>
    </div>
  );
}
