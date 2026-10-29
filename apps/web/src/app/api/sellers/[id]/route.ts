import { desc, eq } from "drizzle-orm";
import { sanitizeSellerText } from "@agentshelf/shared";
import { getSeller, notFound, schema, sellerPublicProfile } from "@agentshelf/core";
import { handler, json, type RouteParams } from "@/lib/api";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Public seller profile: rating, reviews, items sold. */
export const GET = handler(async (_req, { params }: RouteParams<{ id: string }>) => {
  const { id } = await params;
  const database = await db();
  const seller = await getSeller(database, id);
  if (!seller) throw notFound("seller");
  const reviews = await database.query.reviews.findMany({ where: eq(schema.reviews.sellerId, id), orderBy: [desc(schema.reviews.createdAt)], limit: 20 });
  return json({
    ...sellerPublicProfile(seller),
    reviews: reviews.map((r) => ({ stars: r.stars, comment: r.comment ? sanitizeSellerText(r.comment, 300) : null, created_at: r.createdAt.toISOString() })),
  });
});
