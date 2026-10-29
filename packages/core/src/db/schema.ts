import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
  vector,
} from "drizzle-orm/pg-core";

/** Postgres tsvector; the column is GENERATED ALWAYS in SQL, never written from code. */
const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return "tsvector";
  },
});

export const EMBEDDING_DIM = 512;

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  role: text("role").notNull().default("both"), // seller | buyer | both
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const sellers = pgTable("sellers", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  paypalPayeeEmail: text("paypal_payee_email").notNull(),
  payoutsMode: text("payouts_mode").notNull().default("direct"), // direct | platform
  ratingAvg: real("rating_avg"),
  reviewCount: integer("review_count").notNull().default(0),
  itemsSold: integer("items_sold").notNull().default(0),
  memberSince: ts("member_since").notNull().defaultNow(),
  medianReplyMinutes: integer("median_reply_minutes"),
  contactPhoneEnc: text("contact_phone_enc"),
  shareContactAfterPurchase: boolean("share_contact_after_purchase").notNull().default(false),
  bio: text("bio"),
});

export const listings = pgTable(
  "listings",
  {
    id: text("id").primaryKey(),
    sellerId: text("seller_id")
      .notNull()
      .references(() => sellers.userId, { onDelete: "cascade" }),
    status: text("status").notNull().default("DRAFT"),
    title: text("title").notNull().default(""),
    description: text("description").notNull().default(""),
    category: text("category").notNull().default("other"),
    condition: text("condition").notNull().default("GOOD"),
    brand: text("brand"),
    attributes: jsonb("attributes").$type<Record<string, string>>().notNull().default({}),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    priceCents: integer("price_cents").notNull().default(0),
    currency: text("currency").notNull().default("USD"),
    photos: jsonb("photos").$type<string[]>().notNull().default([]),
    areaLabel: text("area_label").notNull().default(""),
    zip: text("zip"),
    geoLat: real("geo_lat"),
    geoLng: real("geo_lng"),
    pickupEnabled: boolean("pickup_enabled").notNull().default(true),
    shippingEnabled: boolean("shipping_enabled").notNull().default(false),
    shippingCents: integer("shipping_cents"),
    handlingDays: integer("handling_days"),
    pickupAddressEnc: text("pickup_address_enc"),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIM }),
    aiDraft: jsonb("ai_draft"),
    aiProvider: text("ai_provider"),
    sellerNote: text("seller_note"),
    searchTsv: tsvector("search_tsv"),
    publishedAt: ts("published_at"),
    soldAt: ts("sold_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("listings_status_idx").on(t.status),
    index("listings_seller_idx").on(t.sellerId),
    index("listings_category_idx").on(t.category),
  ],
);

export const reservations = pgTable("reservations", {
  listingId: text("listing_id")
    .primaryKey()
    .references(() => listings.id, { onDelete: "cascade" }),
  orderId: text("order_id").notNull(),
  expiresAt: ts("expires_at").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const buyerWallets = pgTable("buyer_wallets", {
  buyerId: text("buyer_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  paypalCustomerId: text("paypal_customer_id"),
  paymentTokenEnc: text("payment_token_enc"),
  paymentTokenHint: text("payment_token_hint"),
  payerEmail: text("payer_email"),
  setupTokenId: text("setup_token_id"),
  status: text("status").notNull().default("PENDING"), // PENDING | ACTIVE | DELETED
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const spendPolicies = pgTable(
  "spend_policies",
  {
    id: text("id").primaryKey(),
    buyerId: text("buyer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    maxPerOrderCents: integer("max_per_order_cents").notNull(),
    monthlyCapCents: integer("monthly_cap_cents").notNull(),
    autoApproveBelowCents: integer("auto_approve_below_cents"),
    allowedCategories: jsonb("allowed_categories").$type<string[]>().notNull().default([]),
    blockedKeywords: jsonb("blocked_keywords").$type<string[]>().notNull().default([]),
    homeGeo: jsonb("home_geo").$type<{ lat: number; lng: number; label?: string } | null>(),
    maxPickupKm: real("max_pickup_km"),
    maxShippingCents: integer("max_shipping_cents"),
    allowPickup: boolean("allow_pickup").notNull().default(true),
    allowShipping: boolean("allow_shipping").notNull().default(true),
    minSellerRating: real("min_seller_rating"),
    sourceText: text("source_text").notNull().default(""),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("spend_policies_buyer_version_idx").on(t.buyerId, t.version)],
);

export const agentKeys = pgTable(
  "agent_keys",
  {
    id: text("id").primaryKey(),
    buyerId: text("buyer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    keyHash: text("key_hash").notNull().unique(),
    keyPrefix: text("key_prefix").notNull(),
    label: text("label").notNull().default("Claude Desktop"),
    createdAt: ts("created_at").notNull().defaultNow(),
    lastUsedAt: ts("last_used_at"),
    revokedAt: ts("revoked_at"),
  },
  (t) => [index("agent_keys_buyer_idx").on(t.buyerId)],
);

export const quotes = pgTable(
  "quotes",
  {
    id: text("id").primaryKey(),
    buyerId: text("buyer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    listingId: text("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    fulfillment: text("fulfillment").notNull(),
    itemCents: integer("item_cents").notNull(),
    shippingCents: integer("shipping_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull(),
    policyResult: text("policy_result").notNull(),
    policyReasons: jsonb("policy_reasons").$type<string[]>().notNull().default([]),
    policyVersion: integer("policy_version"),
    expiresAt: ts("expires_at").notNull(),
    usedAt: ts("used_at"),
    orderId: text("order_id"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("quotes_buyer_idx").on(t.buyerId)],
);

export const orders = pgTable(
  "orders",
  {
    id: text("id").primaryKey(),
    listingId: text("listing_id")
      .notNull()
      .references(() => listings.id),
    sellerId: text("seller_id")
      .notNull()
      .references(() => sellers.userId),
    buyerId: text("buyer_id").references(() => users.id),
    channel: text("channel").notNull(), // WEB | AGENT
    fulfillment: text("fulfillment").notNull(), // PICKUP | SHIP
    status: text("status").notNull(),
    itemCents: integer("item_cents").notNull(),
    shippingCents: integer("shipping_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull(),
    currency: text("currency").notNull().default("USD"),
    shippingAddress: jsonb("shipping_address"),
    buyerName: text("buyer_name"),
    buyerEmail: text("buyer_email"),
    trackingNumber: text("tracking_number"),
    carrier: text("carrier"),
    collectedAt: ts("collected_at"),
    paypalOrderId: text("paypal_order_id").unique(),
    paypalCaptureId: text("paypal_capture_id"),
    paypalRefundId: text("paypal_refund_id"),
    requestId: text("request_id").notNull().unique(),
    approvalUrl: text("approval_url"),
    quoteId: text("quote_id"),
    policyResult: text("policy_result"),
    listingSnapshot: jsonb("listing_snapshot"),
    failureReason: text("failure_reason"),
    paypalPayoutBatchId: text("paypal_payout_batch_id"),
    payoutStatus: text("payout_status"),
    payoutCents: integer("payout_cents"),
    payoutError: text("payout_error"),
    paidAt: ts("paid_at"),
    refundedAt: ts("refunded_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("orders_buyer_idx").on(t.buyerId),
    index("orders_seller_idx").on(t.sellerId),
    index("orders_listing_idx").on(t.listingId),
  ],
);

export const conversations = pgTable(
  "conversations",
  {
    id: text("id").primaryKey(),
    listingId: text("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    buyerId: text("buyer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sellerId: text("seller_id")
      .notNull()
      .references(() => sellers.userId, { onDelete: "cascade" }),
    orderId: text("order_id"),
    createdAt: ts("created_at").notNull().defaultNow(),
    lastMessageAt: ts("last_message_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("conversations_listing_buyer_idx").on(t.listingId, t.buyerId)],
);

export const messages = pgTable(
  "messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    sender: text("sender").notNull(), // buyer | buyer_agent | seller
    body: text("body").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
    readAt: ts("read_at"),
  },
  (t) => [index("messages_conversation_idx").on(t.conversationId)],
);

export const reviews = pgTable("reviews", {
  id: text("id").primaryKey(),
  orderId: text("order_id")
    .notNull()
    .unique()
    .references(() => orders.id, { onDelete: "cascade" }),
  sellerId: text("seller_id")
    .notNull()
    .references(() => sellers.userId, { onDelete: "cascade" }),
  buyerId: text("buyer_id").references(() => users.id),
  stars: integer("stars").notNull(),
  comment: text("comment"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const webhookEvents = pgTable("webhook_events", {
  id: text("id").primaryKey(), // PayPal event id
  eventType: text("event_type").notNull(),
  resourceType: text("resource_type"),
  payload: jsonb("payload").notNull(),
  verified: boolean("verified").notNull().default(false),
  processedAt: ts("processed_at"),
  error: text("error"),
  receivedAt: ts("received_at").notNull().defaultNow(),
});

export const auditEvents = pgTable("audit_events", {
  id: serial("id").primaryKey(),
  actor: text("actor").notNull(), // seller | buyer | agent | system
  actorId: text("actor_id"),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  details: jsonb("details"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const schemaMigrations = pgTable("schema_migrations", {
  name: text("name").primaryKey(),
  appliedAt: ts("applied_at").notNull().default(sql`now()`),
});

export type User = typeof users.$inferSelect;
export type Seller = typeof sellers.$inferSelect;
export type Listing = typeof listings.$inferSelect;
export type Reservation = typeof reservations.$inferSelect;
export type BuyerWallet = typeof buyerWallets.$inferSelect;
export type SpendPolicyRow = typeof spendPolicies.$inferSelect;
export type AgentKey = typeof agentKeys.$inferSelect;
export type Quote = typeof quotes.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Review = typeof reviews.$inferSelect;
export type WebhookEvent = typeof webhookEvents.$inferSelect;
