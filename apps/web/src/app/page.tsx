import Link from "next/link";
import { CATEGORIES } from "@agentshelf/shared";
import { browseListings, getEnv, searchListings } from "@agentshelf/core";
import { ListingCard } from "@/components/listing-card";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type Search = { q?: string; category?: string; max?: string; delivery?: string; near?: string };

const TOOLS = ["search_listings", "get_listing", "message_seller", "get_messages", "get_my_policy", "quote_purchase", "buy", "get_order_status", "list_my_orders", "rate_order"];
const QUICK = [
  { label: "Cameras & photo", category: "cameras" },
  { label: "Phones & tablets", category: "phones" },
  { label: "Audio", category: "audio" },
  { label: "Furniture", category: "furniture" },
  { label: "Kitchen", category: "kitchen" },
  { label: "Bikes", category: "bikes" },
  { label: "Video games", category: "video_games" },
  { label: "Tools", category: "tools" },
];

export default async function HomePage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const database = await db();
  const env = getEnv();
  const delivery = sp.delivery === "pickup" || sp.delivery === "ship" ? sp.delivery : "any";
  const maxPrice = sp.max ? Number(sp.max) : undefined;
  const filtering = Boolean(sp.q?.trim() || sp.category || sp.max || sp.near || (sp.delivery && sp.delivery !== "any"));
  const result = sp.q?.trim()
    ? await searchListings(database, { query: sp.q, category: sp.category as never, max_price_usd: maxPrice, delivery, near: sp.near || undefined, limit: 24 })
    : await browseListings(database, { category: sp.category || undefined, max_price_usd: maxPrice, delivery, near: sp.near || null, limit: 24 });
  const note = (result as { note?: string }).note;

  return (
    <div className="space-y-10">
      {!filtering && (
        <section className="-mx-4 border-b border-line bg-surface px-4 pb-10 pt-8 md:-mx-4 md:px-4">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-10">
            <div className="flex min-w-0 flex-1 basis-[520px] flex-col gap-5">
              <span className="badge-ai self-start px-3 py-1.5 text-[13px]">
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2l2.4 5.6L20 9.5l-5.6 2.4L12 17.5l-2.4-5.6L4 9.5l5.6-1.9z" />
                </svg>
                Listings readable by AI shopping agents
              </span>
              <h1 className="font-display text-[34px] font-extrabold leading-[1.05] text-ink md:text-[52px]">
                Sell anything to people <span className="text-accent">and AI agents</span>, paid through PayPal.
              </h1>
              <p className="max-w-[560px] text-base leading-relaxed text-ink-2 md:text-lg">
                Snap a photo. AI writes the listing. Humans pay with PayPal on your page, and buyer agents find and buy it through our MCP server, within the spending rules their owner set.
              </p>
              <SearchForm sp={sp} delivery={delivery} compact />
              <div className="flex flex-wrap gap-2">
                {QUICK.map((c) => (
                  <Link key={c.category} href={`/?category=${c.category}`} className="chip">
                    {c.label}
                  </Link>
                ))}
              </div>
            </div>
            <aside className="card-raised flex min-w-0 flex-1 basis-[340px] flex-col gap-3.5 p-5 lg:max-w-[440px]">
              <div className="flex items-center justify-between">
                <span className="eyebrow text-violet">Live agent purchase</span>
                <span className="text-xs text-muted">via MCP</span>
              </div>
              <div className="rounded-xl bg-surface px-3.5 py-3 text-sm leading-snug">
                <strong>Dan:</strong> Find me a Canon AE-1 in good condition under $120. Pickup near me.
              </div>
              <div className="flex flex-col gap-2 rounded-xl border border-line px-3.5 py-3 text-sm">
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-[10px] bg-accent-soft text-accent">
                    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 8h16v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
                      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
                      <circle cx="12" cy="14" r="3" />
                    </svg>
                  </span>
                  <div className="min-w-0">
                    <div className="font-semibold">Canon AE-1 + 50mm f/1.8</div>
                    <div className="text-xs text-muted">$84 · Good · Park Slope, 1.1 km · Maya A. 4.9★</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 text-xs">
                  <span className="badge-ok px-2 py-1">Policy: AUTO</span>
                  <span className="badge-muted px-2 py-1 font-medium">Under $100 ask-me limit</span>
                  <span className="badge-muted px-2 py-1 font-medium">$216 budget left</span>
                </div>
              </div>
              <div className="flex items-center gap-2.5 rounded-xl bg-ink px-3.5 py-3 text-sm text-white">
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#86efac" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                Paid $84.00 with the saved PayPal wallet · seller paid out
              </div>
            </aside>
          </div>
        </section>
      )}

      {filtering && <SearchForm sp={sp} delivery={delivery} />}

      <section>
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display text-2xl font-extrabold">{sp.q ? `Results for "${sp.q}"` : sp.category ? CATEGORIES.find((c) => c.id === sp.category)?.label ?? "Listings" : "Latest listings"}</h2>
          <div className="flex flex-wrap gap-1.5 text-[13px]">
            <Link href={`/?${qs(sp, { delivery: "any" })}`} className={delivery === "any" ? "rounded-lg bg-surface-2 px-3 py-2 font-semibold text-ink" : "rounded-lg px-3 py-2 font-medium text-ink-2 hover:bg-surface-2"}>
              Pickup or shipping
            </Link>
            <Link href={`/?${qs(sp, { delivery: "pickup" })}`} className={delivery === "pickup" ? "rounded-lg bg-surface-2 px-3 py-2 font-semibold text-ink" : "rounded-lg px-3 py-2 font-medium text-ink-2 hover:bg-surface-2"}>
              Pickup only
            </Link>
            <Link href={`/?${qs(sp, { delivery: "ship" })}`} className={delivery === "ship" ? "rounded-lg bg-surface-2 px-3 py-2 font-semibold text-ink" : "rounded-lg px-3 py-2 font-medium text-ink-2 hover:bg-surface-2"}>
              Ships
            </Link>
            <span className="self-center text-xs text-muted">{result.total} item(s)</span>
          </div>
        </div>
        {note && <p className="mb-3 text-xs text-muted">{note}</p>}
        {result.results.length === 0 ? (
          <div className="card p-8 text-center text-ink-2">
            Nothing here yet. Run <code className="mono">pnpm db:seed</code> for demo listings, or{" "}
            <Link className="text-accent underline" href="/sell">
              list the first item
            </Link>
            .
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
            {result.results.map((card) => (
              <ListingCard key={card.listing_id} card={card} />
            ))}
          </div>
        )}
      </section>

      {!filtering && (
        <>
          <section>
            <h2 className="mb-5 font-display text-2xl font-extrabold">From photo to money in PayPal</h2>
            <div className="grid gap-4 md:grid-cols-3">
              {[
                { n: "1", tone: "bg-accent-soft text-accent", title: "Snap a photo", text: "Upload up to four photos. Vision AI writes the title, description, specs, a price range and a shipping estimate. You confirm the price." },
                { n: "2", tone: "bg-accent-soft text-accent", title: "Live in two channels", text: "A public page with a PayPal button for people, and the same item indexed for AI agents through the MCP server. No platform fee." },
                { n: "3", tone: "bg-violet-soft text-violet", title: "Agents buy within rules", text: "A buyer's agent quotes, the Spend Policy Engine checks caps, categories, distance and seller rating, then pays with the buyer's saved PayPal wallet." },
              ].map((s) => (
                <div key={s.n} className="card flex flex-col gap-2.5 p-5">
                  <span className={`inline-flex h-10 w-10 items-center justify-center rounded-[10px] font-display font-extrabold ${s.tone}`}>{s.n}</span>
                  <strong className="text-[17px]">{s.title}</strong>
                  <span className="text-sm leading-relaxed text-ink-2">{s.text}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="-mx-4 bg-ink px-4 py-10 text-white">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-8">
              <div className="flex min-w-0 flex-1 basis-[360px] flex-col gap-2.5">
                <span className="eyebrow text-[#c4b5fd]">For AI agents</span>
                <h2 className="font-display text-[26px] font-extrabold">Connect Claude Desktop or any MCP client</h2>
                <p className="text-[15px] leading-relaxed text-[#c7cdd8]">Read tools are open. Buying needs a buyer key, and every purchase is re-checked by deterministic code before PayPal is called.</p>
                <code className="mono mt-1.5 block overflow-x-auto rounded-[10px] bg-[#141c2e] px-3.5 py-3 text-[13px] text-[#e8ecf3]">{env.APP_URL}/mcp</code>
              </div>
              <div className="grid min-w-0 flex-1 basis-[360px] grid-cols-2 gap-2 sm:grid-cols-3">
                {TOOLS.map((t) => (
                  <span key={t} className="mono rounded-[10px] border border-[#253049] bg-[#141c2e] px-3 py-2.5 text-xs text-[#e8ecf3]">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function qs(sp: Search, patch: Partial<Search>): string {
  const p = new URLSearchParams();
  const merged = { ...sp, ...patch };
  for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
  return p.toString();
}

function SearchForm({ sp, delivery, compact }: { sp: Search; delivery: string; compact?: boolean }) {
  return (
    <form className={`flex flex-wrap gap-2 rounded-[14px] border border-line-2 bg-white p-2 ${compact ? "shadow-[0_2px_10px_rgba(11,18,32,0.05)]" : "card"}`} method="get">
      <label htmlFor="q" className="sr-only">
        Search
      </label>
      <input id="q" className="min-h-11 min-w-0 flex-[3_1_200px] border-0 bg-transparent px-3 text-base text-ink outline-none placeholder:text-[#7b8494]" name="q" placeholder="Film camera, desk, headphones…" defaultValue={sp.q ?? ""} />
      <label htmlFor="near" className="sr-only">
        ZIP code
      </label>
      <input id="near" className="min-h-11 min-w-0 flex-[1_1_130px] border-0 border-l border-line bg-transparent px-3 text-base text-ink outline-none placeholder:text-[#7b8494]" name="near" placeholder="ZIP for distance" defaultValue={sp.near ?? ""} />
      {!compact && (
        <>
          <select className="input min-h-11 flex-[1_1_150px]" name="category" defaultValue={sp.category ?? ""}>
            <option value="">Any category</option>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <input className="input min-h-11 flex-[1_1_90px]" name="max" type="number" min={1} placeholder="Max $" defaultValue={sp.max ?? ""} />
          <select className="input min-h-11 flex-[1_1_150px]" name="delivery" defaultValue={delivery}>
            <option value="any">Pickup or shipping</option>
            <option value="pickup">Local pickup</option>
            <option value="ship">Shipping</option>
          </select>
        </>
      )}
      <button className="btn-dark" type="submit">
        Search
      </button>
    </form>
  );
}
