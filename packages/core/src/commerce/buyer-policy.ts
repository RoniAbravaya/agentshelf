import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { SpendPolicySchema, type AiPolicyDraft, type PolicyViewOutput, type SpendPolicy } from "@agentshelf/shared";
import { getListingAi, policyFromDraft } from "../ai/index";
import type { Db, Tx } from "../db/client";
import { buyerWallets, orders, spendPolicies, type SpendPolicyRow } from "../db/schema";
import { geocodeZip } from "../geo/zip";
import { newId } from "../ids";
import { audit } from "./audit";
import { validation } from "./errors";

export function rowToPolicy(row: SpendPolicyRow): SpendPolicy {
  return {
    max_per_order_cents: row.maxPerOrderCents,
    monthly_cap_cents: row.monthlyCapCents,
    auto_approve_below_cents: row.autoApproveBelowCents,
    allowed_categories: (row.allowedCategories ?? []) as SpendPolicy["allowed_categories"],
    blocked_keywords: row.blockedKeywords ?? [],
    home_geo: row.homeGeo ?? null,
    max_pickup_km: row.maxPickupKm,
    max_shipping_cents: row.maxShippingCents,
    allow_pickup: row.allowPickup,
    allow_shipping: row.allowShipping,
    min_seller_rating: row.minSellerRating,
    source_text: row.sourceText,
  };
}

export async function getCurrentPolicy(db: Db | Tx, buyerId: string): Promise<{ policy: SpendPolicy; version: number } | null> {
  const row = await db.query.spendPolicies.findFirst({ where: eq(spendPolicies.buyerId, buyerId), orderBy: [desc(spendPolicies.version)] });
  return row ? { policy: rowToPolicy(row), version: row.version } : null;
}

/** Plain-language rules -> policy draft (AI) -> stored shape (cents), for the buyer to confirm. */
export async function parseMandate(
  input: { text: string; homeZip?: string | null; provider?: "anthropic" | "openai" | "stub" },
): Promise<{ draft: AiPolicyDraft; policy: SpendPolicy; provider: string }> {
  const text = input.text.trim();
  if (text.length < 5) throw validation("Describe your rules in a sentence or two");
  const home = input.homeZip ? await geocodeZip(input.homeZip) : null;
  const ai = getListingAi(input.provider);
  const draft = await ai.parseMandate({ text, homeLabel: home?.label });
  const policy = policyFromDraft(draft, { source_text: text, home_geo: home ? { lat: home.lat, lng: home.lng, label: home.label } : null });
  return { draft, policy, provider: `${ai.name}:${ai.model}` };
}

/** Save a confirmed policy as a new version. */
export async function savePolicy(db: Db, buyerId: string, raw: unknown): Promise<{ policy: SpendPolicy; version: number }> {
  const parsed = SpendPolicySchema.safeParse(raw);
  if (!parsed.success) throw validation("Invalid policy", parsed.error.flatten());
  const p = parsed.data;
  if (p.auto_approve_below_cents != null && p.auto_approve_below_cents > p.max_per_order_cents) {
    p.auto_approve_below_cents = p.max_per_order_cents;
  }
  const current = await getCurrentPolicy(db, buyerId);
  const version = (current?.version ?? 0) + 1;
  await db.insert(spendPolicies).values({
    id: newId("policy"),
    buyerId,
    version,
    maxPerOrderCents: p.max_per_order_cents,
    monthlyCapCents: p.monthly_cap_cents,
    autoApproveBelowCents: p.auto_approve_below_cents,
    allowedCategories: p.allowed_categories,
    blockedKeywords: p.blocked_keywords,
    homeGeo: p.home_geo,
    maxPickupKm: p.max_pickup_km,
    maxShippingCents: p.max_shipping_cents,
    allowPickup: p.allow_pickup,
    allowShipping: p.allow_shipping,
    minSellerRating: p.min_seller_rating,
    sourceText: p.source_text,
  });
  await audit(db, { actor: "buyer", actorId: buyerId, action: "policy.save", entity: "policy", entityId: `${buyerId}:v${version}`, details: p });
  return { policy: p, version };
}

/** Agent orders that count against the monthly cap: paid, pending approval, or fulfilled this calendar month (UTC). */
export async function spentThisMonthCents(db: Db | Tx, buyerId: string, now = new Date()): Promise<number> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${orders.totalCents}), 0)::int` })
    .from(orders)
    .where(
      and(
        eq(orders.buyerId, buyerId),
        eq(orders.channel, "AGENT"),
        gte(orders.createdAt, monthStart),
        inArray(orders.status, ["PENDING_APPROVAL", "PAID", "SHIPPED", "PICKED_UP", "COMPLETED"]),
      ),
    );
  return row?.total ?? 0;
}

export type WalletStatus = "ACTIVE" | "MISSING" | "DELETED" | "PENDING";

export async function walletStatus(db: Db | Tx, buyerId: string): Promise<WalletStatus> {
  const w = await db.query.buyerWallets.findFirst({ where: eq(buyerWallets.buyerId, buyerId) });
  if (!w) return "MISSING";
  if (w.status === "ACTIVE" && w.paymentTokenEnc) return "ACTIVE";
  if (w.status === "DELETED") return "DELETED";
  return "PENDING";
}

export async function policyView(db: Db, buyerId: string): Promise<PolicyViewOutput | null> {
  const current = await getCurrentPolicy(db, buyerId);
  if (!current) return null;
  const p = current.policy;
  const spent = await spentThisMonthCents(db, buyerId);
  const wallet = await walletStatus(db, buyerId);
  return {
    max_per_order_cents: p.max_per_order_cents,
    monthly_cap_cents: p.monthly_cap_cents,
    spent_this_month_cents: spent,
    remaining_monthly_cents: Math.max(0, p.monthly_cap_cents - spent),
    auto_approve_below_cents: p.auto_approve_below_cents,
    allowed_categories: p.allowed_categories,
    blocked_keywords: p.blocked_keywords,
    home_area: p.home_geo?.label ?? null,
    max_pickup_km: p.max_pickup_km,
    max_shipping_cents: p.max_shipping_cents,
    allow_pickup: p.allow_pickup,
    allow_shipping: p.allow_shipping,
    min_seller_rating: p.min_seller_rating,
    wallet_status: wallet === "PENDING" ? "MISSING" : wallet,
    source_text: p.source_text,
  };
}
