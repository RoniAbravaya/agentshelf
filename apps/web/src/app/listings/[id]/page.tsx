import Link from "next/link";
import { notFound } from "next/navigation";
import { categoryLabel, conditionLabel, formatUsd } from "@agentshelf/shared";
import { getEnv, getListingDetail, getPayPal } from "@agentshelf/core";
import { CheckoutPanel } from "@/components/checkout-panel";
import { Gallery } from "@/components/gallery";
import { MessageSellerButton } from "@/components/message-seller";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getListingDetail(await db(), id);
  return { title: detail?.title ?? "Listing", description: detail?.seller_description.slice(0, 150) };
}

export default async function ListingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ published?: string; cancelled?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const database = await db();
  const detail = await getListingDetail(database, id);
  if (!detail) notFound();
  const user = await currentUser();
  const env = getEnv();
  const paypal = getPayPal();
  const isOwner = user?.id === detail.seller.seller_id;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: detail.title,
    image: detail.photos,
    description: detail.seller_description,
    brand: detail.brand ?? undefined,
    category: detail.category,
    offers: { "@type": "Offer", price: detail.price_usd, priceCurrency: "USD", availability: detail.status === "AVAILABLE" ? "https://schema.org/InStock" : "https://schema.org/SoldOut", url: `${env.APP_URL}/listings/${detail.listing_id}` },
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="space-y-4">
        {sp.published && (
          <div className="rounded-lg bg-green-50 p-3 text-sm text-green-800">
            <strong>Your item is live!</strong> It has a PayPal checkout for people and is findable by AI shopping agents through the MCP server.{" "}
            <Link href="/dashboard" className="underline">
              Manage it in your dashboard
            </Link>
            .
          </div>
        )}
        {sp.cancelled && <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Checkout cancelled. The item is still available.</div>}
        <Gallery photos={detail.photos} title={detail.title} />
        <div className="card space-y-3 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold">{detail.title}</h1>
              <p className="text-sm text-slate-500">
                {categoryLabel(detail.category)} · {conditionLabel(detail.condition)}
                {detail.brand ? ` · ${detail.brand}` : ""}
              </p>
            </div>
            <div className="text-2xl font-bold">{formatUsd(detail.price_cents)}</div>
          </div>
          <div className="prose-sm whitespace-pre-line text-sm text-slate-800">{detail.seller_description}</div>
          {Object.keys(detail.attributes).length > 0 && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
              {Object.entries(detail.attributes).map(([k, v]) => (
                <div key={k} className="rounded-md bg-slate-50 px-2 py-1">
                  <dt className="text-xs uppercase text-slate-500">{k.replace(/_/g, " ")}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          )}
          {detail.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {detail.tags.map((t) => (
                <span key={t} className="badge bg-slate-100 text-slate-700">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="card grid gap-3 p-5 text-sm sm:grid-cols-2">
          <div>
            <div className="label">Location</div>
            <div>{detail.area}</div>
            <div className="text-xs text-slate-500">Approximate area. Exact pickup address is shared only after payment.</div>
          </div>
          <div>
            <div className="label">Delivery</div>
            <ul>
              {detail.pickup && <li>Local pickup: free</li>}
              {detail.shipping.available && (
                <li>
                  Shipping: {formatUsd(detail.shipping.cost_cents ?? 0)}, ships within {detail.shipping.handling_days} business day(s)
                </li>
              )}
            </ul>
          </div>
        </div>
      </div>

      <aside className="space-y-4">
        <div className="card space-y-2 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-light font-bold text-brand">{detail.seller.display_name.slice(0, 1)}</div>
            <div>
              <Link href={`/sellers/${detail.seller.seller_id}`} className="font-semibold hover:underline">
                {detail.seller.display_name}
              </Link>
              <div className="text-xs text-slate-500">
                {detail.seller.rating != null ? `${detail.seller.rating.toFixed(1)}★ (${detail.seller.review_count} reviews)` : "New seller"} · {detail.seller.items_sold} items sold · member since {new Date(detail.member_since).getFullYear()}
                {detail.median_reply_minutes != null ? ` · usually replies within ${detail.median_reply_minutes < 60 ? `${detail.median_reply_minutes} min` : `${Math.round(detail.median_reply_minutes / 60)} h`}` : ""}
              </div>
            </div>
          </div>
          {detail.recent_reviews.length > 0 && (
            <ul className="space-y-1 border-t border-slate-100 pt-2 text-xs text-slate-600">
              {detail.recent_reviews.map((r, i) => (
                <li key={i}>
                  {"★".repeat(r.stars)} {r.comment ?? ""}
                </li>
              ))}
            </ul>
          )}
        </div>

        {isOwner ? (
          <div className="card p-5 text-sm">
            This is your listing.{" "}
            <Link href={`/sell/${detail.listing_id}`} className="underline">
              Edit
            </Link>{" "}
            ·{" "}
            <Link href="/dashboard" className="underline">
              Dashboard
            </Link>
          </div>
        ) : (
          <CheckoutPanel
            listingId={detail.listing_id}
            status={detail.status}
            priceCents={detail.price_cents}
            pickup={detail.pickup}
            shippingCents={detail.shipping.available ? (detail.shipping.cost_cents ?? 0) : null}
            paypalClientId={paypal?.mode === "mock" ? null : (process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? env.PAYPAL_CLIENT_ID ?? null)}
            paypalMode={paypal?.mode ?? "none"}
            signedIn={Boolean(user)}
          />
        )}
        {!isOwner && <MessageSellerButton listingId={detail.listing_id} signedIn={Boolean(user)} />}
        <p className="text-xs text-slate-500">
          AI agents get the same fields via the <code>search_listings</code> and <code>get_listing</code> MCP tools at <code>{env.APP_URL}/mcp</code>.
        </p>
      </aside>
    </div>
  );
}
