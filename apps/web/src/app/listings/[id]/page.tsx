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

export default async function ListingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ published?: string; cancelled?: string; near?: string }> }) {
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
    <div className="space-y-5">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {sp.published && (
        <div className="rounded-xl bg-ok-soft p-3 text-sm text-ok">
          <strong>Your item is live!</strong> It has a PayPal checkout for people and is findable by AI shopping agents through the MCP server.{" "}
          <Link href="/dashboard" className="underline">
            Manage it in your dashboard
          </Link>
          .
        </div>
      )}
      {sp.cancelled && <div className="rounded-xl bg-warn-soft p-3 text-sm text-warn">Checkout cancelled. The item is still available.</div>}
      <nav aria-label="Breadcrumb" className="flex flex-wrap gap-2 text-[13px] text-muted">
        <Link href="/" className="hover:text-ink">
          Browse
        </Link>
        <span>/</span>
        <Link href={`/?category=${detail.category}`} className="hover:text-ink">
          {categoryLabel(detail.category)}
        </Link>
        <span>/</span>
        <span className="truncate">{detail.title}</span>
      </nav>

      <div className="flex flex-wrap items-start gap-8">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-5">
          <Gallery photos={detail.photos} title={detail.title} />
          <section className="flex flex-col gap-3.5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1.5">
                <h1 className="font-display text-[26px] font-extrabold leading-tight md:text-[32px]">{detail.title}</h1>
                <div className="flex flex-wrap gap-2 text-[13px]">
                  <span className="badge-ok font-semibold">{conditionLabel(detail.condition)} condition</span>
                  <span className="badge-muted font-medium">{categoryLabel(detail.category)}</span>
                  {detail.brand && <span className="badge-muted font-medium">{detail.brand}</span>}
                </div>
              </div>
              <div className="font-display text-[30px] font-extrabold md:text-[34px]">{formatUsd(detail.price_cents)}</div>
            </div>
            <p className="max-w-[720px] whitespace-pre-line text-base leading-relaxed text-ink">{detail.seller_description}</p>
            <p className="text-xs text-muted">Seller-provided description. AI agents receive the same text, labelled as untrusted.</p>
            {Object.keys(detail.attributes).length > 0 && (
              <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
                {Object.entries(detail.attributes).map(([k, v]) => (
                  <div key={k} className="rounded-[10px] bg-surface px-3 py-2.5">
                    <dt className="eyebrow">{k.replace(/_/g, " ")}</dt>
                    <dd className="mt-0.5 text-sm font-semibold">{v}</dd>
                  </div>
                ))}
              </dl>
            )}
            {detail.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {detail.tags.map((t) => (
                  <span key={t} className="badge-muted font-medium">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </section>
          <section className="grid gap-3.5 sm:grid-cols-2">
            <div className="card flex flex-col gap-1.5 p-4">
              <span className="eyebrow">Location</span>
              <span className="text-[15px] font-semibold">
                {detail.area}
                {detail.distance_km != null ? ` · about ${Math.max(1, Math.round(detail.distance_km))} km away` : ""}
              </span>
              <span className="text-[13px] text-ink-2">Approximate area. Exact pickup address is shared only after payment.</span>
            </div>
            <div className="card flex flex-col gap-1.5 p-4">
              <span className="eyebrow">Delivery</span>
              {detail.pickup && <span className="text-[15px] font-semibold">Local pickup: free</span>}
              {detail.shipping.available && (
                <span className="text-sm text-ink-2">
                  Shipping: {formatUsd(detail.shipping.cost_cents ?? 0)}, ships within {detail.shipping.handling_days} business day(s)
                </span>
              )}
            </div>
          </section>
        </div>

        <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-4 lg:max-w-[400px]">
          {isOwner ? (
            <div className="card p-5 text-sm">
              This is your listing.{" "}
              <Link href={`/sell/${detail.listing_id}`} className="text-accent underline">
                Edit
              </Link>{" "}
              ·{" "}
              <Link href="/dashboard" className="text-accent underline">
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

          <div className="card flex flex-col gap-3 p-[18px]">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-[46px] w-[46px] items-center justify-center rounded-full bg-accent-soft text-lg font-bold text-accent">{detail.seller.display_name.slice(0, 1)}</span>
              <div className="min-w-0">
                <Link href={`/sellers/${detail.seller.seller_id}`} className="text-base font-bold text-ink hover:underline">
                  {detail.seller.display_name}
                </Link>
                <div className="text-[13px] text-ink-2">
                  {detail.seller.rating != null ? `${detail.seller.rating.toFixed(1)}★ (${detail.seller.review_count} reviews)` : "New seller"} · {detail.seller.items_sold} items sold
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-1 text-[13px] text-ink-2">
              <span>
                Member since {new Date(detail.member_since).getFullYear()}
                {detail.median_reply_minutes != null ? ` · usually replies within ${detail.median_reply_minutes < 60 ? `${detail.median_reply_minutes} min` : `${Math.round(detail.median_reply_minutes / 60)} h`}` : ""}
              </span>
            </div>
            {detail.recent_reviews.length > 0 && (
              <ul className="flex flex-col gap-1.5 border-t border-line pt-2.5 text-[13px] text-ink-2">
                {detail.recent_reviews.map((r, i) => (
                  <li key={i}>
                    <span className="text-amber-600">{"★".repeat(r.stars)}</span> {r.comment ?? ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {!isOwner && <MessageSellerButton listingId={detail.listing_id} signedIn={Boolean(user)} />}
          <div className="flex items-start gap-3 rounded-[18px] bg-violet-soft px-[18px] py-4 text-[#3b1d8f]">
            <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
              <path d="M12 2l2.4 5.6L20 9.5l-5.6 2.4L12 17.5l-2.4-5.6L4 9.5l5.6-1.9z" />
            </svg>
            <div className="text-[13px] leading-relaxed">
              <strong>Agent-readable.</strong> AI shopping agents get these same fields through the <code className="mono text-xs">search_listings</code> and <code className="mono text-xs">get_listing</code> MCP tools at <code className="mono text-xs">{env.APP_URL}/mcp</code> and can buy within their owner&apos;s spending rules.
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
