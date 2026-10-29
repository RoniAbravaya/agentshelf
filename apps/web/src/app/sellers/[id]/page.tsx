import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { getSeller, schema, sellerPublicProfile, toListingCard } from "@agentshelf/core";
import { ListingCard } from "@/components/listing-card";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function SellerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const database = await db();
  const seller = await getSeller(database, id);
  if (!seller) notFound();
  const profile = sellerPublicProfile(seller);
  const [reviews, items] = await Promise.all([
    database.query.reviews.findMany({ where: eq(schema.reviews.sellerId, id), orderBy: [desc(schema.reviews.createdAt)], limit: 20 }),
    database.query.listings.findMany({ where: and(eq(schema.listings.sellerId, id), eq(schema.listings.status, "AVAILABLE")), orderBy: [desc(schema.listings.publishedAt)], limit: 24 }),
  ]);
  return (
    <div className="space-y-6">
      <div className="card flex items-center gap-4 p-5">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-light text-xl font-bold text-brand">{profile.display_name.slice(0, 1)}</div>
        <div>
          <h1 className="text-2xl font-bold">{profile.display_name}</h1>
          <p className="text-sm text-slate-500">
            {profile.rating != null ? `${profile.rating.toFixed(1)}★ (${profile.review_count} reviews)` : "New seller"} · {profile.items_sold} items sold · member since {new Date(profile.member_since).getFullYear()}
          </p>
          {profile.bio && <p className="text-sm">{profile.bio}</p>}
        </div>
      </div>
      {reviews.length > 0 && (
        <section className="card p-5">
          <h2 className="mb-2 font-semibold">Reviews</h2>
          <ul className="space-y-1 text-sm">
            {reviews.map((r) => (
              <li key={r.id}>
                <span className="text-amber-500">{"★".repeat(r.stars)}</span> {r.comment} <span className="text-xs text-slate-400">{r.createdAt.toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section>
        <h2 className="mb-2 font-semibold">Items for sale</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((l) => (
            <ListingCard key={l.id} card={toListingCard(l, seller)} />
          ))}
        </div>
      </section>
    </div>
  );
}
