import { SearchListingsInput } from "@agentshelf/shared";
import { browseListings, searchListings } from "@agentshelf/core";
import { handler, json } from "@/lib/api";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Storefront browse/search: GET /api/listings?q=&category=&max_price_usd=&delivery=&near=&limit= */
export const GET = handler(async (req) => {
  const sp = new URL(req.url).searchParams;
  const q = sp.get("q")?.trim();
  const database = await db();
  if (q) {
    const input = SearchListingsInput.parse({
      query: q,
      category: sp.get("category") || undefined,
      max_price_usd: sp.get("max_price_usd") ? Number(sp.get("max_price_usd")) : undefined,
      condition: sp.get("condition") || undefined,
      near: sp.get("near") || undefined,
      max_distance_km: sp.get("max_distance_km") ? Number(sp.get("max_distance_km")) : undefined,
      delivery: sp.get("delivery") || undefined,
      min_seller_rating: sp.get("min_seller_rating") ? Number(sp.get("min_seller_rating")) : undefined,
      limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
    });
    return json(await searchListings(database, input));
  }
  return json(
    await browseListings(database, {
      category: sp.get("category") || undefined,
      max_price_usd: sp.get("max_price_usd") ? Number(sp.get("max_price_usd")) : undefined,
      delivery: (sp.get("delivery") as "pickup" | "ship" | "any" | null) ?? "any",
      near: sp.get("near"),
      limit: sp.get("limit") ? Number(sp.get("limit")) : 24,
      offset: sp.get("offset") ? Number(sp.get("offset")) : 0,
    }),
  );
});
