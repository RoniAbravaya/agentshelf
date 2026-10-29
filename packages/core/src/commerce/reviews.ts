import { eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { orders, reviews, sellers, type Review } from "../db/schema";
import { newId } from "../ids";
import { audit } from "./audit";
import { conflict, forbidden, notFound, validation } from "./errors";

/** One review per order; only the buyer of a paid/completed order may rate. */
export async function rateOrder(
  db: Db,
  input: { orderId: string; buyerId: string; stars: number; comment?: string | null; viaAgent?: boolean },
): Promise<{ review: Review; seller_rating: number; review_count: number }> {
  if (!Number.isInteger(input.stars) || input.stars < 1 || input.stars > 5) throw validation("Stars must be 1-5");
  const order = await db.query.orders.findFirst({ where: eq(orders.id, input.orderId) });
  if (!order) throw notFound("order");
  if (order.buyerId !== input.buyerId) throw forbidden("Only the buyer can rate this order");
  if (!["PAID", "SHIPPED", "PICKED_UP", "COMPLETED"].includes(order.status)) throw validation(`Order is ${order.status}; only paid orders can be rated`);
  const existing = await db.query.reviews.findFirst({ where: eq(reviews.orderId, order.id) });
  if (existing) throw conflict("This order was already rated");

  const review = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(reviews)
      .values({ id: newId("review"), orderId: order.id, sellerId: order.sellerId, buyerId: input.buyerId, stars: input.stars, comment: input.comment?.trim() || null })
      .returning();
    await tx
      .update(sellers)
      .set({
        ratingAvg: sql`(coalesce(${sellers.ratingAvg}, 0) * ${sellers.reviewCount} + ${input.stars}) / (${sellers.reviewCount} + 1)`,
        reviewCount: sql`${sellers.reviewCount} + 1`,
      })
      .where(eq(sellers.userId, order.sellerId));
    if (order.status !== "COMPLETED") await tx.update(orders).set({ status: "COMPLETED", updatedAt: new Date() }).where(eq(orders.id, order.id));
    await audit(tx, { actor: input.viaAgent ? "agent" : "buyer", actorId: input.buyerId, action: "order.rate", entity: "order", entityId: order.id, details: { stars: input.stars } });
    return row!;
  });
  const seller = await db.query.sellers.findFirst({ where: eq(sellers.userId, order.sellerId) });
  return { review, seller_rating: Math.round((seller?.ratingAvg ?? input.stars) * 10) / 10, review_count: seller?.reviewCount ?? 1 };
}
