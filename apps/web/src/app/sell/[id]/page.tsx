import { notFound } from "next/navigation";
import type { AiListingDraft } from "@agentshelf/shared";
import { CommerceError, getOwnedListing, getSeller } from "@agentshelf/core";
import { ListingEditor } from "@/components/listing-editor";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata = { title: "Review your listing" };

export default async function ReviewListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/sell/${id}`);
  const database = await db();
  let listing;
  try {
    listing = await getOwnedListing(database, id, user.id);
  } catch (err) {
    if (err instanceof CommerceError) notFound();
    throw err;
  }
  const seller = await getSeller(database, user.id);
  const draft = (listing.aiDraft as AiListingDraft | null) ?? null;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{listing.status === "DRAFT" ? "Check what AI wrote" : "Edit listing"}</h1>
        <p className="text-sm text-slate-600">
          Everything marked <span className="badge-ai">AI</span> was drafted from your photos{listing.aiProvider ? ` by ${listing.aiProvider}` : ""}. Edit anything, set your price, choose delivery and publish.
        </p>
      </div>
      <ListingEditor
        listing={{
          id: listing.id,
          status: listing.status,
          title: listing.title,
          description: listing.description,
          category: listing.category,
          condition: listing.condition,
          brand: listing.brand,
          attributes: listing.attributes,
          tags: listing.tags,
          price_cents: listing.priceCents,
          photos: listing.photos,
          area_label: listing.areaLabel,
          zip: listing.zip,
          pickup_enabled: listing.pickupEnabled,
          shipping_enabled: listing.shippingEnabled,
          shipping_cents: listing.shippingCents,
          handling_days: listing.handlingDays,
          has_pickup_address: Boolean(listing.pickupAddressEnc),
        }}
        draft={draft}
        payeeEmail={seller?.paypalPayeeEmail ?? user.email}
      />
    </div>
  );
}
