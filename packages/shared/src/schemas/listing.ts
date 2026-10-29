import { z } from "zod";
import { CATEGORY_IDS, CONDITION_IDS, LISTING_STATUSES, PLATFORM_LIMITS } from "../catalog";

/** Strict JSON the listing generator (Claude or OpenAI vision) must return. */
export const AiListingDraftSchema = z.object({
  accepted: z
    .boolean()
    .describe("false if the photos show people, ID documents, weapons, drugs, counterfeit or other prohibited items"),
  rejection_reason: z
    .string()
    .nullable()
    .describe("Short reason shown to the seller when accepted is false, else null"),
  title: z.string().describe("Concise product title, max 80 chars"),
  description: z
    .string()
    .describe("Honest buyer-facing description: what it is, what is included, visible condition and flaws. Max 1000 chars"),
  category: z.enum(CATEGORY_IDS),
  condition: z.enum(CONDITION_IDS),
  brand: z.string().nullable(),
  attributes: z
    .array(z.object({ key: z.string(), value: z.string() }))
    .describe("Specs as key/value pairs, e.g. format=35mm, mount=FD, year=1976"),
  tags: z.array(z.string()).describe("3-8 short search tags"),
  price_suggestion: z.object({
    low_usd: z.number().describe("Low end of a realistic resale price range in USD"),
    high_usd: z.number().describe("High end of a realistic resale price range in USD"),
    rationale: z.string().describe("One or two sentences explaining the range"),
  }),
  shipping_suggestion: z.object({
    size_class: z.enum(["SMALL", "MEDIUM", "LARGE", "FREIGHT"]),
    suggested_shipping_usd: z.number().describe("Flat US domestic shipping cost suggestion in USD"),
  }),
});
export type AiListingDraft = z.infer<typeof AiListingDraftSchema>;

export const AttributesSchema = z.record(z.string(), z.string());

/** What the seller submits to publish (after editing the AI draft). */
export const PublishListingInputSchema = z
  .object({
    title: z.string().trim().min(3).max(PLATFORM_LIMITS.titleMax),
    description: z.string().trim().min(10).max(PLATFORM_LIMITS.descriptionMax),
    category: z.enum(CATEGORY_IDS),
    condition: z.enum(CONDITION_IDS),
    brand: z.string().trim().max(60).nullable().optional(),
    attributes: AttributesSchema.default({}),
    tags: z.array(z.string().trim().min(1).max(30)).max(12).default([]),
    price_cents: z.number().int().min(PLATFORM_LIMITS.minPriceCents).max(PLATFORM_LIMITS.maxPriceCents),
    area_label: z.string().trim().min(2).max(80),
    zip: z.string().trim().regex(/^\d{5}$/, "US ZIP code (5 digits)"),
    pickup_enabled: z.boolean(),
    shipping_enabled: z.boolean(),
    shipping_cents: z.number().int().min(0).max(PLATFORM_LIMITS.maxShippingCents).nullable().optional(),
    handling_days: z.number().int().min(1).max(5).nullable().optional(),
    pickup_address: z.string().trim().max(200).nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (!v.pickup_enabled && !v.shipping_enabled) {
      ctx.addIssue({ code: "custom", message: "Enable local pickup, shipping, or both", path: ["pickup_enabled"] });
    }
    if (v.shipping_enabled) {
      if (v.shipping_cents == null)
        ctx.addIssue({ code: "custom", message: "Shipping cost is required", path: ["shipping_cents"] });
      if (v.handling_days == null)
        ctx.addIssue({ code: "custom", message: "Handling time is required", path: ["handling_days"] });
    }
  });
export type PublishListingInput = z.infer<typeof PublishListingInputSchema>;

export const ListingStatusSchema = z.enum(LISTING_STATUSES);

/** Public listing card (search results, storefront grid, MCP search_listings). */
export const ListingCardSchema = z.object({
  listing_id: z.string(),
  title: z.string(),
  price_cents: z.number().int(),
  price_usd: z.number(),
  condition: z.enum(CONDITION_IDS),
  category: z.enum(CATEGORY_IDS),
  cover_photo_url: z.string().nullable(),
  photo_count: z.number().int(),
  area: z.string(),
  distance_km: z.number().nullable(),
  pickup: z.boolean(),
  shipping: z.object({
    available: z.boolean(),
    cost_cents: z.number().int().nullable(),
    handling_days: z.number().int().nullable(),
  }),
  seller: z.object({
    seller_id: z.string(),
    display_name: z.string(),
    rating: z.number().nullable(),
    review_count: z.number().int(),
    items_sold: z.number().int(),
  }),
  status: ListingStatusSchema,
  match_reason: z.string().optional(),
});
export type ListingCard = z.infer<typeof ListingCardSchema>;
