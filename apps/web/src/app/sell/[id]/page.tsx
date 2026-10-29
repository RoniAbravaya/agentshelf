import { notFound } from "next/navigation";
import type { AiListingDraft } from "@agentshelf/shared";
import { CommerceError, getOwnedListing, getSeller } from "@agentshelf/core";
import { ListingEditor } from "@/components/listing-editor";
import { Steps } from "@/components/steps";
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
  const isDraft = listing.status === "DRAFT";
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {isDraft && <Steps current={3} />}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-extrabold md:text-[32px]">{isDraft ? "Check what AI wrote" : "Edit listing"}</h1>
          <p className="mt-1 text-sm text-ink-2">
            {listing.aiProvider ? `Drafted from your ${listing.photos.length} photo(s) by ${listing.aiProvider}. ` : ""}
            Edit anything marked <span className="badge-ai">AI</span>, set your price, then publish.
          </p>
        </div>
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
        sellerName={seller?.displayName ?? user.displayName}
        sellerRating={seller?.ratingAvg ?? null}
        sellerReviews={seller?.reviewCount ?? 0}
      />
    </div>
  );
}
