import { and, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { CONDITION_IDS, haversineKm, type GeoPoint, type ListingCard, type SearchListingsInput } from "@agentshelf/shared";
import { embedText, embeddingsEnabled } from "../ai/embeddings";
import type { Db } from "../db/client";
import { listings, sellers } from "../db/schema";
import { resolveNear } from "../geo/zip";
import { toListingCard } from "./listings";

/**
 * Hybrid search over AVAILABLE listings:
 *  1. Postgres full-text (websearch_to_tsquery) with ILIKE fallback for short queries
 *  2. Optional pgvector similarity when an embeddings provider is configured
 *  3. Reciprocal rank fusion in code, then filters that need geo (distance)
 * Only structured fields are returned; seller text is sanitised elsewhere.
 */
export interface SearchOptions extends SearchListingsInput {
  /** Resolved buyer home point (used when `near` is absent). */
  homeGeo?: GeoPoint | null;
}

export interface SearchResult {
  results: ListingCard[];
  total: number;
  note?: string;
}

const CONDITION_RANK: Record<string, number> = { FOR_PARTS: 0, FAIR: 1, GOOD: 2, LIKE_NEW: 3, NEW: 4 };

export async function searchListings(db: Db, opts: SearchOptions): Promise<SearchResult> {
  const limit = opts.limit ?? 10;
  const near = (await resolveNear(opts.near)) ?? opts.homeGeo ?? null;

  const filters = [eq(listings.status, "AVAILABLE")];
  if (opts.max_price_usd != null) filters.push(lte(listings.priceCents, Math.round(opts.max_price_usd * 100)));
  if (opts.category) filters.push(eq(listings.category, opts.category));
  if (opts.condition) {
    const min = CONDITION_RANK[opts.condition] ?? 0;
    filters.push(inArray(listings.condition, CONDITION_IDS.filter((c) => (CONDITION_RANK[c] ?? 0) >= min)));
  }
  if (opts.delivery === "pickup") filters.push(eq(listings.pickupEnabled, true));
  if (opts.delivery === "ship") filters.push(eq(listings.shippingEnabled, true));
  const where = and(...filters);

  const q = opts.query.trim();
  const CANDIDATES = 50;

  // 1. Keyword ranking
  const tsRows = await db
    .select({ id: listings.id, rank: sql<number>`ts_rank(${listings.searchTsv}, websearch_to_tsquery('english', ${q}))` })
    .from(listings)
    .where(and(where, sql`${listings.searchTsv} @@ websearch_to_tsquery('english', ${q})`))
    .orderBy(desc(sql`ts_rank(${listings.searchTsv}, websearch_to_tsquery('english', ${q}))`))
    .limit(CANDIDATES);

  const scores = new Map<string, number>();
  const reasons = new Map<string, string>();
  const rrf = (rows: Array<{ id: string }>, label: string) => {
    rows.forEach((r, i) => {
      scores.set(r.id, (scores.get(r.id) ?? 0) + 1 / (60 + i + 1));
      if (!reasons.has(r.id)) reasons.set(r.id, label);
    });
  };
  rrf(tsRows, "keyword match");

  // 1b. Loose fallback: substring match on title/tags/brand when FTS finds little.
  if (tsRows.length < 3) {
    const like = `%${q.toLowerCase()}%`;
    const looseRows = await db
      .select({ id: listings.id })
      .from(listings)
      .where(
        and(
          where,
          sql`(lower(${listings.title}) LIKE ${like} OR lower(coalesce(${listings.brand}, '')) LIKE ${like} OR lower(${listings.tags}::text) LIKE ${like} OR lower(${listings.category}) LIKE ${like})`,
        ),
      )
      .limit(CANDIDATES);
    rrf(looseRows, "title or tag match");
  }

  // 2. Semantic ranking
  let note: string | undefined;
  if (embeddingsEnabled()) {
    try {
      const vec = await embedText(q, "query");
      if (vec) {
        const literal = `[${vec.join(",")}]`;
        // Cosine distance below 0.6 only: with few embedded listings, an unbounded
        // nearest-neighbour query would return unrelated items for any query.
        const vecRows = await db
          .select({ id: listings.id })
          .from(listings)
          .where(and(where, sql`${listings.embedding} IS NOT NULL`, sql`(${listings.embedding} <=> ${literal}::vector) < 0.6`))
          .orderBy(sql`${listings.embedding} <=> ${literal}::vector`)
          .limit(CANDIDATES);
        rrf(vecRows, "semantic match");
      }
    } catch (err) {
      note = "Semantic search unavailable; showing keyword results.";
      console.error("embedding search failed", err);
    }
  }

  // 3. If nothing matched at all, show category/recent items so the agent can still browse.
  if (scores.size === 0) {
    const recent = await db.select({ id: listings.id }).from(listings).where(where).orderBy(desc(listings.publishedAt)).limit(limit);
    rrf(recent, "recent listing (no direct match)");
    if (recent.length) note = note ?? `No direct matches for "${q}"; showing recent listings that fit the filters.`;
  }

  const rankedIds = [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  if (rankedIds.length === 0) return { results: [], total: 0, note };

  const rows = await db
    .select({ listing: listings, seller: sellers })
    .from(listings)
    .innerJoin(sellers, eq(sellers.userId, listings.sellerId))
    .where(inArray(listings.id, rankedIds));
  const byId = new Map(rows.map((r) => [r.listing.id, r]));

  const cards: ListingCard[] = [];
  for (const id of rankedIds) {
    const row = byId.get(id);
    if (!row) continue;
    const { listing: l, seller: s } = row;
    if (opts.min_seller_rating != null && (s.ratingAvg == null || s.ratingAvg < opts.min_seller_rating)) continue;
    let distance: number | null = null;
    if (near && l.geoLat != null && l.geoLng != null) distance = haversineKm(near, { lat: l.geoLat, lng: l.geoLng });
    if (opts.max_distance_km != null && opts.delivery !== "ship") {
      // Distance limit applies to pickup; shippable items still qualify when delivery is "any".
      const tooFar = distance == null || distance > opts.max_distance_km;
      if (tooFar && !(opts.delivery === "any" && l.shippingEnabled)) continue;
    }
    cards.push(toListingCard(l, s, distance, reasons.get(id)));
  }
  return { results: cards.slice(0, limit), total: cards.length, note };
}

/** Storefront browse (no query): newest first with simple filters. */
export async function browseListings(
  db: Db,
  opts: { category?: string; max_price_usd?: number; delivery?: "pickup" | "ship" | "any"; near?: string | null; limit?: number; offset?: number },
): Promise<{ results: ListingCard[]; total: number }> {
  const filters = [eq(listings.status, "AVAILABLE")];
  if (opts.category) filters.push(eq(listings.category, opts.category));
  if (opts.max_price_usd != null) filters.push(lte(listings.priceCents, Math.round(opts.max_price_usd * 100)));
  if (opts.delivery === "pickup") filters.push(eq(listings.pickupEnabled, true));
  if (opts.delivery === "ship") filters.push(eq(listings.shippingEnabled, true));
  const where = and(...filters);
  const near = await resolveNear(opts.near);
  const rows = await db
    .select({ listing: listings, seller: sellers })
    .from(listings)
    .innerJoin(sellers, eq(sellers.userId, listings.sellerId))
    .where(where)
    .orderBy(desc(listings.publishedAt))
    .limit(opts.limit ?? 24)
    .offset(opts.offset ?? 0);
  const [{ count }] = (await db.select({ count: sql<number>`count(*)::int` }).from(listings).where(where)) as [{ count: number }];
  return {
    results: rows.map(({ listing: l, seller: s }) =>
      toListingCard(l, s, near && l.geoLat != null && l.geoLng != null ? haversineKm(near, { lat: l.geoLat, lng: l.geoLng }) : null),
    ),
    total: count,
  };
}
