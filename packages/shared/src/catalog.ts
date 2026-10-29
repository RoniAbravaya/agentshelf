/** Fixed category list. Used by listings, search filters and buyer spending rules. */
export const CATEGORIES = [
  { id: "cameras", label: "Cameras & photo" },
  { id: "phones", label: "Phones & tablets" },
  { id: "computers", label: "Computers & laptops" },
  { id: "audio", label: "Audio & headphones" },
  { id: "electronics", label: "Other electronics" },
  { id: "video_games", label: "Video games & consoles" },
  { id: "furniture", label: "Furniture" },
  { id: "home", label: "Home & decor" },
  { id: "kitchen", label: "Kitchen & appliances" },
  { id: "clothing", label: "Clothing" },
  { id: "shoes", label: "Shoes" },
  { id: "accessories", label: "Bags & accessories" },
  { id: "jewelry", label: "Jewelry & watches" },
  { id: "sports", label: "Sports & fitness" },
  { id: "outdoors", label: "Outdoors & camping" },
  { id: "bikes", label: "Bikes & scooters" },
  { id: "toys", label: "Toys & games" },
  { id: "baby", label: "Baby & kids" },
  { id: "books", label: "Books" },
  { id: "music", label: "Music & instruments" },
  { id: "movies", label: "Movies & media" },
  { id: "art", label: "Art & crafts" },
  { id: "collectibles", label: "Collectibles & vintage" },
  { id: "tools", label: "Tools & DIY" },
  { id: "garden", label: "Garden" },
  { id: "pets", label: "Pet supplies" },
  { id: "other", label: "Other" },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];
export const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as [CategoryId, ...CategoryId[]];

export function categoryLabel(id: string): string {
  return CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

export const CONDITIONS = [
  { id: "NEW", label: "New" },
  { id: "LIKE_NEW", label: "Like new" },
  { id: "GOOD", label: "Good" },
  { id: "FAIR", label: "Fair" },
  { id: "FOR_PARTS", label: "For parts" },
] as const;
export type Condition = (typeof CONDITIONS)[number]["id"];
export const CONDITION_IDS = CONDITIONS.map((c) => c.id) as [Condition, ...Condition[]];
export function conditionLabel(id: string): string {
  return CONDITIONS.find((c) => c.id === id)?.label ?? id;
}

export const LISTING_STATUSES = ["DRAFT", "AVAILABLE", "RESERVED", "SOLD", "PAUSED", "REMOVED"] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export const ORDER_STATUSES = [
  "PENDING_APPROVAL", // created, waiting for buyer to approve in PayPal
  "PAID",
  "SHIPPED",
  "PICKED_UP",
  "COMPLETED",
  "REFUNDED",
  "FAILED",
  "CANCELLED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const FULFILLMENT_METHODS = ["PICKUP", "SHIP"] as const;
export type Fulfillment = (typeof FULFILLMENT_METHODS)[number];

export const ORDER_CHANNELS = ["WEB", "AGENT"] as const;
export type OrderChannel = (typeof ORDER_CHANNELS)[number];

export const POLICY_RESULTS = ["AUTO", "NEEDS_APPROVAL", "BLOCKED"] as const;
export type PolicyResultKind = (typeof POLICY_RESULTS)[number];

/** Hard platform ceilings that apply regardless of the buyer's own policy. */
export const PLATFORM_LIMITS = {
  minPriceCents: 100, // $1
  maxPriceCents: 100_000, // $1,000 per listing in the MVP
  maxPerOrderCents: 100_000, // $1,000 per agent order
  maxMonthlyCents: 500_000, // $5,000 per buyer per month
  maxShippingCents: 20_000, // $200
  maxPhotos: 4,
  maxPhotoBytes: 10 * 1024 * 1024,
  reservationMinutes: 10,
  quoteMinutes: 5,
  titleMax: 80,
  descriptionMax: 1000,
} as const;
