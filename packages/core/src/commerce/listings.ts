import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  AiListingDraftSchema,
  PLATFORM_LIMITS,
  PublishListingInputSchema,
  centsToUsdNumber,
  sanitizeSellerText,
  type AiListingDraft,
  type ListingCard,
  type ListingDetail,
  type PublishListingInput,
} from "@agentshelf/shared";
import { embedText } from "../ai/embeddings";
import { getListingAi, normalizeListingDraft, type ImageInput } from "../ai/index";
import { decryptString, encryptString } from "../crypto";
import type { Db, Tx } from "../db/client";
import { listings, reservations, reviews, sellers, type Listing, type Seller } from "../db/schema";
import { geocodeZip } from "../geo/zip";
import { newId } from "../ids";
import { extensionFor, getStorage, sniffImageType } from "../storage/index";
import { audit } from "./audit";
import { CommerceError, forbidden, notFound, validation } from "./errors";
import { sellerPublicProfile } from "./users";

export interface ListingWithSeller {
  listing: Listing;
  seller: Seller;
}

// ---- Create draft from photos -----------------------------------------------

export interface CreateDraftInput {
  sellerId: string;
  photos: Array<{ bytes: Buffer; filename?: string }>;
  sellerNote?: string;
  zip?: string;
  aiProvider?: "anthropic" | "openai" | "stub";
}

export interface CreateDraftResult {
  listing: Listing;
  draft: AiListingDraft;
  provider: { name: string; model: string };
}

/** Upload photos, run the vision model, store the AI draft on a DRAFT listing. */
export async function createDraftFromPhotos(db: Db, input: CreateDraftInput): Promise<CreateDraftResult> {
  if (input.photos.length < 1 || input.photos.length > PLATFORM_LIMITS.maxPhotos) {
    throw validation(`Upload 1-${PLATFORM_LIMITS.maxPhotos} photos`);
  }
  const images: ImageInput[] = [];
  for (const p of input.photos) {
    if (p.bytes.length > PLATFORM_LIMITS.maxPhotoBytes) throw validation("Each photo must be 10 MB or less");
    const type = sniffImageType(p.bytes);
    if (!type) throw validation("Photos must be JPG, PNG, WebP or GIF (HEIC: export as JPG first)");
    images.push({ base64: p.bytes.toString("base64"), mediaType: type });
  }

  const listingId = newId("listing");
  const storage = getStorage();
  const urls: string[] = [];
  for (let i = 0; i < input.photos.length; i++) {
    const img = images[i]!;
    const stored = await storage.put(`${listingId}/${i + 1}${extensionFor(img.mediaType)}`, input.photos[i]!.bytes, img.mediaType);
    urls.push(stored.url);
  }

  const ai = getListingAi(input.aiProvider);
  let draft: AiListingDraft;
  try {
    draft = normalizeListingDraft(AiListingDraftSchema.parse(await ai.generateListingDraft({ images, sellerNote: input.sellerNote, zip: input.zip })));
  } catch (err) {
    if (err instanceof Error && err.name === "AiRefusalError") {
      throw new CommerceError(`These photos cannot be listed: ${err.message}`, "AI_REJECTED");
    }
    throw err;
  }
  if (!draft.accepted) {
    throw new CommerceError(`These photos cannot be listed: ${draft.rejection_reason ?? "prohibited content"}`, "AI_REJECTED", draft);
  }

  const geo = input.zip ? await geocodeZip(input.zip) : null;
  const attributes = Object.fromEntries(draft.attributes.map((a) => [a.key, a.value]));
  const [row] = await db
    .insert(listings)
    .values({
      id: listingId,
      sellerId: input.sellerId,
      status: "DRAFT",
      title: draft.title,
      description: draft.description,
      category: draft.category,
      condition: draft.condition,
      brand: draft.brand,
      attributes,
      tags: draft.tags,
      priceCents: Math.round(((draft.price_suggestion.low_usd + draft.price_suggestion.high_usd) / 2) * 100),
      photos: urls,
      zip: input.zip ?? null,
      areaLabel: geo?.label ?? "",
      geoLat: geo?.lat ?? null,
      geoLng: geo?.lng ?? null,
      pickupEnabled: true,
      shippingEnabled: draft.shipping_suggestion.size_class !== "FREIGHT",
      shippingCents: draft.shipping_suggestion.size_class === "FREIGHT" ? null : Math.round(draft.shipping_suggestion.suggested_shipping_usd * 100),
      handlingDays: 2,
      aiDraft: draft,
      aiProvider: `${ai.name}:${ai.model}`,
      sellerNote: input.sellerNote ?? null,
    })
    .returning();
  await audit(db, { actor: "seller", actorId: input.sellerId, action: "listing.draft", entity: "listing", entityId: listingId, details: { provider: ai.name, model: ai.model } });
  return { listing: row!, draft, provider: { name: ai.name, model: ai.model } };
}

// ---- Publish / edit / manage ------------------------------------------------

async function ownedListing(db: Db | Tx, listingId: string, sellerId: string): Promise<Listing> {
  const row = await db.query.listings.findFirst({ where: eq(listings.id, listingId) });
  if (!row || row.status === "REMOVED") throw notFound("listing");
  if (row.sellerId !== sellerId) throw forbidden("This listing belongs to another seller");
  return row;
}

export async function publishListing(db: Db, listingId: string, sellerId: string, raw: unknown): Promise<Listing> {
  const parsed = PublishListingInputSchema.safeParse(raw);
  if (!parsed.success) throw validation("Invalid listing", parsed.error.flatten());
  const input: PublishListingInput = parsed.data;
  const current = await ownedListing(db, listingId, sellerId);
  if (current.status === "RESERVED") throw new CommerceError("Listing is reserved in an active checkout", "RESERVED");
  if (current.status === "SOLD") throw validation("Sold listings cannot be edited");
  if (current.photos.length === 0) throw validation("Add at least one photo");

  const geo = await geocodeZip(input.zip);
  const embedding = await embedText(embeddingText(input), "document");
  const [row] = await db
    .update(listings)
    .set({
      status: "AVAILABLE",
      title: input.title,
      description: input.description,
      category: input.category,
      condition: input.condition,
      brand: input.brand ?? null,
      attributes: input.attributes,
      tags: input.tags,
      priceCents: input.price_cents,
      areaLabel: input.area_label,
      zip: input.zip,
      geoLat: geo?.lat ?? current.geoLat,
      geoLng: geo?.lng ?? current.geoLng,
      pickupEnabled: input.pickup_enabled,
      shippingEnabled: input.shipping_enabled,
      shippingCents: input.shipping_enabled ? (input.shipping_cents ?? 0) : null,
      handlingDays: input.shipping_enabled ? (input.handling_days ?? 2) : null,
      pickupAddressEnc: input.pickup_address ? encryptString(input.pickup_address) : current.pickupAddressEnc,
      embedding: embedding ?? current.embedding,
      publishedAt: current.publishedAt ?? new Date(),
      updatedAt: new Date(),
    })
    .where(eq(listings.id, listingId))
    .returning();
  await audit(db, { actor: "seller", actorId: sellerId, action: "listing.publish", entity: "listing", entityId: listingId });
  return row!;
}

function embeddingText(l: { title: string; description: string; category: string; brand?: string | null; tags?: string[]; attributes?: Record<string, string> }): string {
  const attrs = Object.entries(l.attributes ?? {})
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");
  return [l.title, l.brand ?? "", l.category, (l.tags ?? []).join(" "), attrs, l.description].filter(Boolean).join("\n");
}

export async function setListingStatus(
  db: Db,
  listingId: string,
  sellerId: string,
  action: "pause" | "resume" | "mark-sold" | "delete" | "relist",
): Promise<Listing> {
  const current = await ownedListing(db, listingId, sellerId);
  if (current.status === "RESERVED") throw new CommerceError("Listing is reserved in an active checkout", "RESERVED");
  let status: string;
  switch (action) {
    case "pause":
      if (current.status !== "AVAILABLE") throw validation("Only available listings can be paused");
      status = "PAUSED";
      break;
    case "resume":
      if (current.status !== "PAUSED") throw validation("Only paused listings can be resumed");
      status = "AVAILABLE";
      break;
    case "mark-sold":
      status = "SOLD";
      break;
    case "relist":
      if (current.status !== "SOLD") throw validation("Only sold listings can be relisted");
      status = "AVAILABLE";
      break;
    case "delete":
      status = "REMOVED";
      break;
  }
  const [row] = await db
    .update(listings)
    .set({ status, updatedAt: new Date(), soldAt: action === "mark-sold" ? new Date() : action === "relist" ? null : current.soldAt })
    .where(eq(listings.id, listingId))
    .returning();
  await audit(db, { actor: "seller", actorId: sellerId, action: `listing.${action}`, entity: "listing", entityId: listingId });
  return row!;
}

export async function getOwnedListing(db: Db, listingId: string, sellerId: string): Promise<Listing> {
  return ownedListing(db, listingId, sellerId);
}

export async function listSellerListings(db: Db, sellerId: string): Promise<Listing[]> {
  return db.query.listings.findMany({
    where: and(eq(listings.sellerId, sellerId), sql`${listings.status} <> 'REMOVED'`),
    orderBy: [desc(listings.updatedAt)],
  });
}

// ---- Public reads -----------------------------------------------------------

export async function getListingWithSeller(db: Db | Tx, listingId: string): Promise<ListingWithSeller | null> {
  const listing = await db.query.listings.findFirst({ where: eq(listings.id, listingId) });
  if (!listing) return null;
  const seller = await db.query.sellers.findFirst({ where: eq(sellers.userId, listing.sellerId) });
  if (!seller) return null;
  return { listing, seller };
}

export function toListingCard(l: Listing, s: Seller, distanceKm: number | null = null, matchReason?: string): ListingCard {
  const profile = sellerPublicProfile(s);
  return {
    listing_id: l.id,
    title: l.title,
    price_cents: l.priceCents,
    price_usd: centsToUsdNumber(l.priceCents),
    condition: l.condition as ListingCard["condition"],
    category: l.category as ListingCard["category"],
    cover_photo_url: l.photos[0] ?? null,
    photo_count: l.photos.length,
    area: l.areaLabel,
    distance_km: distanceKm == null ? null : Math.round(distanceKm * 10) / 10,
    pickup: l.pickupEnabled,
    shipping: { available: l.shippingEnabled, cost_cents: l.shippingEnabled ? (l.shippingCents ?? 0) : null, handling_days: l.shippingEnabled ? l.handlingDays : null },
    seller: {
      seller_id: profile.seller_id,
      display_name: profile.display_name,
      rating: profile.rating,
      review_count: profile.review_count,
      items_sold: profile.items_sold,
    },
    status: l.status as ListingCard["status"],
    ...(matchReason ? { match_reason: matchReason } : {}),
  };
}

export async function getListingDetail(db: Db, listingId: string, distanceKm: number | null = null): Promise<ListingDetail | null> {
  const pair = await getListingWithSeller(db, listingId);
  if (!pair || pair.listing.status === "REMOVED" || pair.listing.status === "DRAFT") return null;
  const { listing: l, seller: s } = pair;
  const recent = await db.query.reviews.findMany({ where: eq(reviews.sellerId, s.userId), orderBy: [desc(reviews.createdAt)], limit: 3 });
  const profile = sellerPublicProfile(s);
  return {
    ...toListingCard(l, s, distanceKm),
    photos: l.photos,
    seller_description: sanitizeSellerText(l.description),
    attributes: l.attributes,
    tags: l.tags,
    brand: l.brand,
    recent_reviews: recent.map((r) => ({ stars: r.stars, comment: r.comment ? sanitizeSellerText(r.comment, 300) : null, created_at: r.createdAt.toISOString() })),
    member_since: profile.member_since,
    median_reply_minutes: profile.median_reply_minutes,
    published_at: l.publishedAt?.toISOString() ?? null,
  };
}

export function pickupAddressFor(l: Listing): string | null {
  if (!l.pickupAddressEnc) return null;
  try {
    return decryptString(l.pickupAddressEnc);
  } catch {
    return null;
  }
}

/** Release reservations whose TTL passed; returns the number released. */
export async function expireReservations(db: Db): Promise<number> {
  const expired = await db.query.reservations.findMany({ where: sql`${reservations.expiresAt} < now()` });
  if (expired.length === 0) return 0;
  const ids = expired.map((r) => r.listingId);
  await db.transaction(async (tx) => {
    await tx.delete(reservations).where(inArray(reservations.listingId, ids));
    await tx
      .update(listings)
      .set({ status: "AVAILABLE", updatedAt: new Date() })
      .where(and(inArray(listings.id, ids), eq(listings.status, "RESERVED")));
  });
  return ids.length;
}
