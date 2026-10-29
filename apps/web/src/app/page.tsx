import Link from "next/link";
import { CATEGORIES } from "@agentshelf/shared";
import { browseListings, searchListings } from "@agentshelf/core";
import { ListingCard } from "@/components/listing-card";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type Search = { q?: string; category?: string; max?: string; delivery?: string; near?: string };

export default async function HomePage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const database = await db();
  const delivery = sp.delivery === "pickup" || sp.delivery === "ship" ? sp.delivery : "any";
  const maxPrice = sp.max ? Number(sp.max) : undefined;
  const result = sp.q?.trim()
    ? await searchListings(database, { query: sp.q, category: sp.category as never, max_price_usd: maxPrice, delivery, near: sp.near || undefined, limit: 24 })
    : await browseListings(database, { category: sp.category || undefined, max_price_usd: maxPrice, delivery, near: sp.near || null, limit: 24 });
  const note = (result as { note?: string }).note;

  return (
    <div className="space-y-6">
      <section className="card flex flex-col gap-4 bg-gradient-to-br from-brand to-slate-800 p-6 text-white md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sell anything to people and AI agents</h1>
          <p className="mt-1 text-sm text-slate-200">
            Snap a photo, let AI write the listing, get paid through PayPal. Every item is also exposed to AI shopping agents through our MCP server.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/sell" className="btn-accent">
            Sell an item
          </Link>
          <Link href="/agent" className="btn-secondary">
            Try the demo agent
          </Link>
        </div>
      </section>

      <form className="card grid gap-3 p-4 md:grid-cols-[2fr_1fr_1fr_1fr_auto]" method="get">
        <input className="input" name="q" placeholder="Search: film camera, desk, headphones..." defaultValue={sp.q ?? ""} />
        <select className="input" name="category" defaultValue={sp.category ?? ""}>
          <option value="">Any category</option>
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <input className="input" name="max" type="number" min={1} placeholder="Max $" defaultValue={sp.max ?? ""} />
        <select className="input" name="delivery" defaultValue={delivery}>
          <option value="any">Pickup or shipping</option>
          <option value="pickup">Local pickup</option>
          <option value="ship">Shipping</option>
        </select>
        <button className="btn-primary" type="submit">
          Search
        </button>
        <input className="input md:col-span-2" name="near" placeholder="Your ZIP (for distance)" defaultValue={sp.near ?? ""} />
      </form>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">{sp.q ? `Results for "${sp.q}"` : "Latest listings"}</h2>
          <span className="text-xs text-slate-500">{result.total} item(s)</span>
        </div>
        {note && <p className="mb-3 text-xs text-slate-500">{note}</p>}
        {result.results.length === 0 ? (
          <div className="card p-8 text-center text-slate-500">
            Nothing here yet. Run <code>pnpm db:seed</code> for demo listings, or <Link className="underline" href="/sell">list the first item</Link>.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {result.results.map((card) => (
              <ListingCard key={card.listing_id} card={card} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
