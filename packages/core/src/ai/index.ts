import { PLATFORM_LIMITS, SpendPolicySchema, type AiListingDraft, type AiPolicyDraft, type SpendPolicy } from "@agentshelf/shared";
import { getEnv } from "../env";
import { AnthropicListingProvider } from "./anthropic";
import { OpenAiListingProvider, OPENAI_DEFAULT_MODEL } from "./openai";
import type { ListingAiProvider } from "./provider";
import { StubListingProvider } from "./stub";

export * from "./provider";
export { AnthropicListingProvider } from "./anthropic";
export { OpenAiListingProvider } from "./openai";
export { StubListingProvider } from "./stub";

let cached: ListingAiProvider | null = null;

/** Provider selection: LISTING_AI_PROVIDER, else first configured key, else stub. */
export function getListingAi(override?: "anthropic" | "openai" | "stub"): ListingAiProvider {
  const env = getEnv();
  const choice = override ?? env.LISTING_AI_PROVIDER ?? (env.ANTHROPIC_API_KEY ? "anthropic" : env.OPENAI_API_KEY ? "openai" : "stub");
  if (!override && cached && cached.name === choice) return cached;
  let provider: ListingAiProvider;
  switch (choice) {
    case "anthropic":
      if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
      provider = new AnthropicListingProvider(env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL);
      break;
    case "openai":
      if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set");
      provider = new OpenAiListingProvider(env.OPENAI_API_KEY, env.OPENAI_MODEL ?? OPENAI_DEFAULT_MODEL);
      break;
    default:
      provider = new StubListingProvider();
  }
  if (!override) cached = provider;
  return provider;
}

export function availableAiProviders(): Array<{ id: "anthropic" | "openai" | "stub"; label: string; model: string }> {
  const env = getEnv();
  const out: Array<{ id: "anthropic" | "openai" | "stub"; label: string; model: string }> = [];
  if (env.ANTHROPIC_API_KEY) out.push({ id: "anthropic", label: "Claude vision", model: env.ANTHROPIC_MODEL });
  if (env.OPENAI_API_KEY) out.push({ id: "openai", label: "ChatGPT vision", model: env.OPENAI_MODEL ?? OPENAI_DEFAULT_MODEL });
  if (out.length === 0) out.push({ id: "stub", label: "No AI key configured (placeholder draft)", model: "stub" });
  return out;
}

/** Post-process an AI draft: enforce lengths and sane numbers regardless of provider. */
export function normalizeListingDraft(draft: AiListingDraft): AiListingDraft {
  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));
  const low = clamp(Math.round(draft.price_suggestion.low_usd), 1, 1000);
  const high = clamp(Math.round(draft.price_suggestion.high_usd), low, 1000);
  return {
    ...draft,
    title: draft.title.trim().slice(0, PLATFORM_LIMITS.titleMax),
    description: draft.description.trim().slice(0, PLATFORM_LIMITS.descriptionMax),
    brand: draft.brand?.trim() || null,
    attributes: draft.attributes
      .filter((a) => a.key.trim() && a.value.trim())
      .slice(0, 12)
      .map((a) => ({ key: a.key.trim().toLowerCase().replace(/\s+/g, "_").slice(0, 30), value: a.value.trim().slice(0, 60) })),
    tags: Array.from(new Set(draft.tags.map((t) => t.trim().toLowerCase()).filter(Boolean))).slice(0, 10),
    price_suggestion: { ...draft.price_suggestion, low_usd: low, high_usd: high },
    shipping_suggestion: {
      ...draft.shipping_suggestion,
      suggested_shipping_usd: clamp(Math.round(draft.shipping_suggestion.suggested_shipping_usd), 0, 200),
    },
  };
}

/** Convert an AI policy draft (USD) to a stored policy (cents) with platform ceilings. */
export function policyFromDraft(
  draft: AiPolicyDraft,
  extras: { source_text: string; home_geo?: SpendPolicy["home_geo"] },
): SpendPolicy {
  const cents = (usd: number | null | undefined) => (usd == null ? null : Math.max(0, Math.round(usd * 100)));
  const perOrder = Math.min(cents(draft.max_per_order_usd) ?? PLATFORM_LIMITS.maxPerOrderCents, PLATFORM_LIMITS.maxPerOrderCents);
  const monthly = Math.min(cents(draft.monthly_cap_usd) ?? PLATFORM_LIMITS.maxMonthlyCents, PLATFORM_LIMITS.maxMonthlyCents);
  return SpendPolicySchema.parse({
    max_per_order_cents: perOrder,
    monthly_cap_cents: monthly,
    auto_approve_below_cents: cents(draft.auto_approve_below_usd),
    allowed_categories: draft.allowed_categories,
    blocked_keywords: draft.blocked_keywords.map((k) => k.trim().toLowerCase()).filter(Boolean),
    home_geo: extras.home_geo ?? null,
    max_pickup_km: draft.max_pickup_km,
    max_shipping_cents: cents(draft.max_shipping_usd),
    allow_pickup: draft.allow_pickup,
    allow_shipping: draft.allow_shipping,
    min_seller_rating: draft.min_seller_rating == null ? null : Math.min(5, Math.max(1, draft.min_seller_rating)),
    source_text: extras.source_text,
  });
}
