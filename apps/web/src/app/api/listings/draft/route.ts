import { createDraftFromPhotos, unauthenticated } from "@agentshelf/core";
import { handler, json } from "@/lib/api";
import { assertSameOrigin, currentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Upload photos -> AI listing draft (DRAFT listing). multipart/form-data: photos[], note, zip, provider */
export const POST = handler(async (req) => {
  await assertSameOrigin();
  const user = await currentUser();
  if (!user) throw unauthenticated();
  const form = await req.formData();
  const photos: Array<{ bytes: Buffer; filename?: string }> = [];
  for (const entry of form.getAll("photos")) {
    if (entry instanceof File && entry.size > 0) photos.push({ bytes: Buffer.from(await entry.arrayBuffer()), filename: entry.name });
  }
  const providerRaw = String(form.get("provider") ?? "");
  const provider = providerRaw === "anthropic" || providerRaw === "openai" || providerRaw === "stub" ? providerRaw : undefined;
  const zipRaw = String(form.get("zip") ?? "").trim();
  const result = await createDraftFromPhotos(await db(), {
    sellerId: user.id,
    photos,
    sellerNote: String(form.get("note") ?? "").trim() || undefined,
    zip: /^\d{5}$/.test(zipRaw) ? zipRaw : undefined,
    aiProvider: provider,
  });
  return json({ listing: result.listing, draft: result.draft, provider: result.provider });
});
