import { availableAiProviders } from "@agentshelf/core";
import { Steps } from "@/components/steps";
import { UploadForm } from "@/components/upload-form";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Sell an item" };

export default async function SellPage() {
  await requireUser("/sell");
  const providers = availableAiProviders();
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Steps current={1} />
      <div>
        <h1 className="font-display text-[26px] font-extrabold md:text-[32px]">Add 1–4 photos</h1>
        <p className="mt-1 text-sm text-ink-2">Front, back, details and any flaws. AI writes the listing from them; you set the price and delivery.</p>
      </div>
      <UploadForm providers={providers} />
      <p className="text-xs leading-relaxed text-muted">Photos with people, ID documents or prohibited items are rejected before anything is published.</p>
    </div>
  );
}
