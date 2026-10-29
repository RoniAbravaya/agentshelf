import { NextResponse } from "next/server";
import { browseListings, getEnv } from "@agentshelf/core";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Machine-readable product feed (schema.org ItemList) for non-MCP agents and crawlers. */
export async function GET() {
  const env = getEnv();
  const { results } = await browseListings(await db(), { limit: 200 });
  const feed = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "AgentShelf listings",
    url: env.APP_URL,
    mcp: { endpoint: `${env.APP_URL}/mcp`, transport: "streamable-http", auth: "Bearer <buyer key> for purchase tools" },
    numberOfItems: results.length,
    itemListElement: results.map((r, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "Product",
        "@id": `${env.APP_URL}/listings/${r.listing_id}`,
        name: r.title,
        image: r.cover_photo_url,
        category: r.category,
        itemCondition: `https://schema.org/${r.condition === "NEW" ? "NewCondition" : r.condition === "FOR_PARTS" ? "DamagedCondition" : "UsedCondition"}`,
        offers: {
          "@type": "Offer",
          price: r.price_usd,
          priceCurrency: "USD",
          availability: "https://schema.org/InStock",
          url: `${env.APP_URL}/listings/${r.listing_id}`,
          areaServed: r.area,
          shippingDetails: r.shipping.available ? { "@type": "OfferShippingDetails", shippingRate: { "@type": "MonetaryAmount", value: (r.shipping.cost_cents ?? 0) / 100, currency: "USD" } } : undefined,
          seller: { "@type": "Person", name: r.seller.display_name, aggregateRating: r.seller.rating != null ? { "@type": "AggregateRating", ratingValue: r.seller.rating, reviewCount: r.seller.review_count } : undefined },
        },
      },
    })),
  };
  return NextResponse.json(feed, { headers: { "Cache-Control": "public, max-age=60" } });
}
