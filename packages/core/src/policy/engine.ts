import {
  categoryLabel,
  formatUsd,
  haversineKm,
  PLATFORM_LIMITS,
  type Fulfillment,
  type PolicyCheck,
  type PolicyDecision,
  type SpendPolicy,
} from "@agentshelf/shared";

/**
 * Spend Policy Engine.
 *
 * Deterministic, side-effect free. The LLM can propose a purchase; only this
 * code decides whether money moves. Every agent purchase runs through
 * evaluatePolicy() twice: once at quote time and again inside buy() with fresh
 * data, so nothing the model (or a malicious listing) says can change the result.
 */

export interface PolicyListingView {
  listing_id: string;
  status: string;
  title: string;
  category: string;
  price_cents: number;
  geo: { lat: number; lng: number } | null;
  pickup_enabled: boolean;
  shipping_enabled: boolean;
  shipping_cents: number | null;
  seller_rating: number | null;
  seller_review_count: number;
  seller_id: string;
}

export interface PolicyContext {
  policy: SpendPolicy | null;
  listing: PolicyListingView;
  fulfillment: Fulfillment;
  /** Spend already committed this calendar month (PAID + pending approval), in cents. */
  spent_this_month_cents: number;
  wallet_status: "ACTIVE" | "MISSING" | "DELETED" | "PENDING";
  /** Buyer id, used to block buying your own listing. */
  buyer_id: string;
  quote?: { expires_at: Date; used_at: Date | null } | null;
  /** True if this buyer already has a live order for this listing. */
  duplicate_order?: boolean;
  now?: Date;
}

export function computeTotals(listing: Pick<PolicyListingView, "price_cents" | "shipping_cents">, fulfillment: Fulfillment) {
  const item_cents = listing.price_cents;
  const shipping_cents = fulfillment === "SHIP" ? (listing.shipping_cents ?? 0) : 0;
  return { item_cents, shipping_cents, total_cents: item_cents + shipping_cents };
}

export function evaluatePolicy(ctx: PolicyContext): PolicyDecision {
  const now = ctx.now ?? new Date();
  const checks: PolicyCheck[] = [];
  const block = (rule: string, detail: string) => checks.push({ rule, passed: false, detail });
  const pass = (rule: string, detail: string) => checks.push({ rule, passed: true, detail });

  const { listing, fulfillment, policy } = ctx;
  const totals = computeTotals(listing, fulfillment);
  const monthlyCap = policy?.monthly_cap_cents ?? 0;
  const remaining = Math.max(0, monthlyCap - ctx.spent_this_month_cents);

  // 0. Policy and wallet must exist.
  if (!policy) {
    block("policy", "No spending policy saved. Set spending rules in AgentShelf settings first.");
    return finish(checks, 0);
  }
  if (ctx.wallet_status !== "ACTIVE") {
    block(
      "wallet",
      ctx.wallet_status === "DELETED"
        ? "Saved PayPal wallet was removed. Re-connect PayPal in AgentShelf settings."
        : "No saved PayPal wallet. Connect PayPal in AgentShelf settings first.",
    );
  } else pass("wallet", "Saved PayPal wallet is active");

  // 1. Quote freshness (only when buying).
  if (ctx.quote) {
    if (ctx.quote.used_at) block("quote", "This quote was already used. Request a new quote.");
    else if (ctx.quote.expires_at.getTime() <= now.getTime()) block("quote", "Quote expired. Request a new quote.");
    else pass("quote", "Quote is fresh and unused");
  }

  // 2. Listing availability and ownership.
  if (listing.status !== "AVAILABLE") block("availability", `Item is ${listing.status.toLowerCase()}, not available.`);
  else pass("availability", "Item is available");
  if (listing.seller_id === ctx.buyer_id) block("ownership", "You cannot buy your own listing.");
  if (ctx.duplicate_order) block("duplicate", "You already have an order for this item.");

  // 3. Fulfillment must be offered by the seller and allowed by the buyer.
  if (fulfillment === "PICKUP" && !listing.pickup_enabled) block("fulfillment", "Seller does not offer local pickup.");
  else if (fulfillment === "SHIP" && !listing.shipping_enabled) block("fulfillment", "Seller does not offer shipping.");
  else if (fulfillment === "PICKUP" && !policy.allow_pickup) block("fulfillment", "Your rules do not allow local pickup.");
  else if (fulfillment === "SHIP" && !policy.allow_shipping) block("fulfillment", "Your rules do not allow shipped items.");
  else pass("fulfillment", `${fulfillment === "PICKUP" ? "Local pickup" : "Shipping"} is offered and allowed`);

  // 4. Category and keywords.
  if (policy.allowed_categories.length > 0 && !policy.allowed_categories.includes(listing.category as never)) {
    block(
      "category",
      `Category "${categoryLabel(listing.category)}" is not in your allowed list (${policy.allowed_categories.map(categoryLabel).join(", ")}).`,
    );
  } else pass("category", "Category allowed");
  const lowerTitle = listing.title.toLowerCase();
  const hit = policy.blocked_keywords.find((k) => k && lowerTitle.includes(k.toLowerCase()));
  if (hit) block("keywords", `Title contains blocked keyword "${hit}".`);
  else pass("keywords", "No blocked keywords");

  // 5. Caps: per order, monthly, platform ceilings.
  if (totals.total_cents > policy.max_per_order_cents) {
    block("per_order_cap", `Total ${formatUsd(totals.total_cents)} exceeds your per-order limit of ${formatUsd(policy.max_per_order_cents)}.`);
  } else pass("per_order_cap", `Total ${formatUsd(totals.total_cents)} within per-order limit ${formatUsd(policy.max_per_order_cents)}`);
  if (totals.total_cents > remaining) {
    block("monthly_cap", `Total ${formatUsd(totals.total_cents)} exceeds your remaining monthly budget of ${formatUsd(remaining)}.`);
  } else pass("monthly_cap", `${formatUsd(remaining - totals.total_cents)} of monthly budget would remain`);
  if (totals.total_cents > PLATFORM_LIMITS.maxPerOrderCents) {
    block("platform_cap", `Agent purchases are capped at ${formatUsd(PLATFORM_LIMITS.maxPerOrderCents)} per order on AgentShelf.`);
  }

  // 6. Distance (pickup) and shipping cost (ship).
  if (fulfillment === "PICKUP" && policy.max_pickup_km != null) {
    if (!policy.home_geo) block("distance", "Set your home area in AgentShelf settings to enforce the pickup distance rule.");
    else if (!listing.geo) block("distance", "Listing has no location; cannot verify pickup distance.");
    else {
      const km = haversineKm(policy.home_geo, listing.geo);
      if (km > policy.max_pickup_km) block("distance", `Pickup is about ${km.toFixed(0)} km away; your limit is ${policy.max_pickup_km} km.`);
      else pass("distance", `Pickup about ${km.toFixed(0)} km away (limit ${policy.max_pickup_km} km)`);
    }
  }
  if (fulfillment === "SHIP" && policy.max_shipping_cents != null) {
    if (totals.shipping_cents > policy.max_shipping_cents) {
      block("shipping_cost", `Shipping ${formatUsd(totals.shipping_cents)} exceeds your limit of ${formatUsd(policy.max_shipping_cents)}.`);
    } else pass("shipping_cost", `Shipping ${formatUsd(totals.shipping_cents)} within limit`);
  }

  // 7. Seller reputation.
  if (policy.min_seller_rating != null) {
    if (listing.seller_rating == null || listing.seller_review_count === 0) {
      block("seller_rating", `Seller has no ratings yet; your rules require ${policy.min_seller_rating}+ stars.`);
    } else if (listing.seller_rating < policy.min_seller_rating) {
      block("seller_rating", `Seller rating ${listing.seller_rating.toFixed(1)} is below your minimum of ${policy.min_seller_rating}.`);
    } else pass("seller_rating", `Seller rated ${listing.seller_rating.toFixed(1)} (minimum ${policy.min_seller_rating})`);
  }

  const failed = checks.filter((c) => !c.passed);
  if (failed.length > 0) return finish(checks, remaining);

  // 8. Approval threshold.
  if (policy.auto_approve_below_cents != null && totals.total_cents >= policy.auto_approve_below_cents) {
    checks.push({
      rule: "approval",
      passed: true,
      detail: `Total ${formatUsd(totals.total_cents)} is at or above your ask-me threshold of ${formatUsd(policy.auto_approve_below_cents)}; buyer approval required`,
    });
    return {
      result: "NEEDS_APPROVAL",
      reasons: [
        `Total ${formatUsd(totals.total_cents)} is at or above your ask-me threshold of ${formatUsd(policy.auto_approve_below_cents)}.`,
      ],
      checks,
      remaining_monthly_cents: remaining,
    };
  }
  checks.push({ rule: "approval", passed: true, detail: "Within auto-approve threshold" });
  return { result: "AUTO", reasons: [], checks, remaining_monthly_cents: remaining };
}

function finish(checks: PolicyCheck[], remaining: number): PolicyDecision {
  const failed = checks.filter((c) => !c.passed);
  return {
    result: "BLOCKED",
    reasons: failed.map((c) => c.detail),
    checks,
    remaining_monthly_cents: remaining,
  };
}
