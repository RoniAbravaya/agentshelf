import { CATEGORY_IDS, type AiListingDraft, type AiPolicyDraft } from "@agentshelf/shared";
import type { ListingAiProvider, ListingDraftRequest, MandateParseRequest } from "./provider";

/**
 * Deterministic provider for demos and tests without API keys. It never looks
 * at the photos; it produces a sensible placeholder the seller can edit, and
 * parses mandates with simple regexes.
 */
export class StubListingProvider implements ListingAiProvider {
  readonly name = "stub" as const;
  readonly model = "stub";

  async generateListingDraft(req: ListingDraftRequest): Promise<AiListingDraft> {
    const note = req.sellerNote?.trim() ?? "";
    const title = note ? note.split(/[.\n]/)[0]!.slice(0, 80) : "Untitled item";
    return {
      accepted: true,
      rejection_reason: null,
      title: title || "Untitled item",
      description: note
        ? `${note.slice(0, 900)} (Draft written without AI: add details about condition and what is included.)`
        : "Draft written without an AI provider configured. Describe the item, what is included and any flaws.",
      category: "other",
      condition: "GOOD",
      brand: null,
      attributes: [],
      tags: ["second-hand"],
      price_suggestion: { low_usd: 20, high_usd: 60, rationale: "Placeholder range; set ANTHROPIC_API_KEY or OPENAI_API_KEY for a real estimate." },
      shipping_suggestion: { size_class: "MEDIUM", suggested_shipping_usd: 12 },
    };
  }

  async parseMandate(req: MandateParseRequest): Promise<AiPolicyDraft> {
    const t = req.text.toLowerCase();
    const money = (re: RegExp) => {
      const m = t.match(re);
      return m ? Number(m[1]!.replace(/,/g, "")) : null;
    };
    const perOrder =
      money(/(?:max|maximum|up to|under|below|less than)\s*\$?\s*([\d,]+(?:\.\d+)?)\s*(?:each|per item|per order|a piece|apiece|per purchase)?/) ??
      money(/\$\s*([\d,]+(?:\.\d+)?)\s*(?:each|per item|per order|max)/);
    const monthly = money(/\$?\s*([\d,]+(?:\.\d+)?)\s*(?:a|per|each|\/)\s*month/) ?? money(/month(?:ly)?\s*(?:budget|cap|limit)?\s*(?:of|is|:)?\s*\$?\s*([\d,]+)/);
    const ask = money(/ask(?: me)?\s*(?:for anything|if|when|above|over|beyond|more than)\s*\$?\s*([\d,]+)/) ?? money(/(?:above|over)\s*\$?\s*([\d,]+)\s*ask/);
    const km = money(/(?:within|under|less than|max(?:imum)?)\s*([\d.]+)\s*km/);
    const ship = money(/shipping\s*(?:under|below|less than|max(?:imum)?|up to)\s*\$?\s*([\d,]+)/);
    const rating = money(/(?:rated|rating)\s*([\d.]+)\s*\+?/);
    const categories = CATEGORY_IDS.filter((c) => t.includes(c.replace("_", " ")) || t.includes(c));
    if (/camera/.test(t) && !categories.includes("cameras")) categories.push("cameras");
    const noPickup = /no (local )?pickup|shipping only/.test(t);
    const noShip = /no shipping|pickup only/.test(t);
    const summary = [
      perOrder != null ? `Max $${perOrder} per item.` : "No per-item limit stated.",
      monthly != null ? `$${monthly} per month.` : "No monthly cap stated.",
      ask != null ? `Ask before anything $${ask} or more.` : "No approval threshold stated.",
      categories.length ? `Only ${categories.join(", ")}.` : "Any category.",
      km != null ? `Pickup within ${km} km.` : "",
      ship != null ? `Shipping under $${ship}.` : "",
      rating != null ? `Sellers rated ${rating}+.` : "",
    ]
      .filter(Boolean)
      .join(" ");
    return {
      max_per_order_usd: perOrder,
      monthly_cap_usd: monthly,
      auto_approve_below_usd: ask,
      allowed_categories: categories,
      blocked_keywords: [],
      max_pickup_km: km,
      max_shipping_usd: ship,
      allow_pickup: !noPickup,
      allow_shipping: !noShip,
      min_seller_rating: rating,
      summary,
    };
  }
}
