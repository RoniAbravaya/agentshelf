import { z } from "zod";
import { CATEGORY_IDS, PLATFORM_LIMITS, POLICY_RESULTS } from "../catalog";

export const GeoPointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  label: z.string().optional(),
});
export type GeoPoint = z.infer<typeof GeoPointSchema>;

/** Strict JSON the mandate parser must return from plain-language rules. Amounts in USD here; stored as cents. */
export const AiPolicyDraftSchema = z.object({
  max_per_order_usd: z
    .number()
    .nullable()
    .describe("Max price for a single purchase in USD, or null if the buyer gave none"),
  monthly_cap_usd: z.number().nullable().describe("Total monthly spend cap in USD, or null"),
  auto_approve_below_usd: z
    .number()
    .nullable()
    .describe(
      "Purchases strictly below this USD amount are paid automatically; at or above, the buyer is asked first. null = everything within the caps is automatic",
    ),
  allowed_categories: z
    .array(z.enum(CATEGORY_IDS))
    .describe("Categories the agent may buy from. Empty array = any category"),
  blocked_keywords: z.array(z.string()).describe("Words in a title that must block a purchase"),
  max_pickup_km: z.number().nullable().describe("Max distance for local pickup in km, or null for no pickup limit"),
  max_shipping_usd: z.number().nullable().describe("Max acceptable shipping cost in USD, or null"),
  allow_pickup: z.boolean(),
  allow_shipping: z.boolean(),
  min_seller_rating: z.number().nullable().describe("Minimum seller star rating 1-5, or null"),
  summary: z.string().describe("One-paragraph plain-English restatement of the rules for the buyer to confirm"),
});
export type AiPolicyDraft = z.infer<typeof AiPolicyDraftSchema>;

/** The policy as saved (cents, with platform ceilings applied). */
export const SpendPolicySchema = z.object({
  max_per_order_cents: z.number().int().min(0).max(PLATFORM_LIMITS.maxPerOrderCents),
  monthly_cap_cents: z.number().int().min(0).max(PLATFORM_LIMITS.maxMonthlyCents),
  auto_approve_below_cents: z.number().int().min(0).nullable(),
  allowed_categories: z.array(z.enum(CATEGORY_IDS)).default([]),
  blocked_keywords: z.array(z.string().trim().min(1)).default([]),
  home_geo: GeoPointSchema.nullable().default(null),
  max_pickup_km: z.number().min(0).nullable().default(null),
  max_shipping_cents: z.number().int().min(0).nullable().default(null),
  allow_pickup: z.boolean().default(true),
  allow_shipping: z.boolean().default(true),
  min_seller_rating: z.number().min(1).max(5).nullable().default(null),
  source_text: z.string().default(""),
});
export type SpendPolicy = z.infer<typeof SpendPolicySchema>;

export const PolicyResultKindSchema = z.enum(POLICY_RESULTS);

export const PolicyCheckSchema = z.object({
  rule: z.string(),
  passed: z.boolean(),
  detail: z.string(),
});
export type PolicyCheck = z.infer<typeof PolicyCheckSchema>;

export const PolicyDecisionSchema = z.object({
  result: PolicyResultKindSchema,
  reasons: z.array(z.string()),
  checks: z.array(PolicyCheckSchema),
  remaining_monthly_cents: z.number().int(),
});
export type PolicyDecision = z.infer<typeof PolicyDecisionSchema>;
