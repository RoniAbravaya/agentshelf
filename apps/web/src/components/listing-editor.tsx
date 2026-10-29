"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CATEGORIES, CONDITIONS, conditionLabel, formatUsd, publicName, type AiListingDraft } from "@agentshelf/shared";

export interface EditorListing {
  id: string;
  status: string;
  title: string;
  description: string;
  category: string;
  condition: string;
  brand: string | null;
  attributes: Record<string, string>;
  tags: string[];
  price_cents: number;
  photos: string[];
  area_label: string;
  zip: string | null;
  pickup_enabled: boolean;
  shipping_enabled: boolean;
  shipping_cents: number | null;
  handling_days: number | null;
  has_pickup_address: boolean;
}

export function ListingEditor({ listing, draft, payeeEmail, sellerName, sellerRating, sellerReviews }: { listing: EditorListing; draft: AiListingDraft | null; payeeEmail: string; sellerName: string; sellerRating: number | null; sellerReviews: number }) {
  const router = useRouter();
  const [title, setTitle] = useState(listing.title);
  const [description, setDescription] = useState(listing.description);
  const [category, setCategory] = useState(listing.category);
  const [condition, setCondition] = useState(listing.condition);
  const [brand, setBrand] = useState(listing.brand ?? "");
  const [specs, setSpecs] = useState<Array<{ key: string; value: string }>>(Object.entries(listing.attributes).map(([key, value]) => ({ key, value })));
  const [tags, setTags] = useState(listing.tags.join(", "));
  const [price, setPrice] = useState((listing.price_cents / 100).toFixed(2));
  const [area, setArea] = useState(listing.area_label);
  const [zip, setZip] = useState(listing.zip ?? "");
  const [pickup, setPickup] = useState(listing.pickup_enabled);
  const [ship, setShip] = useState(listing.shipping_enabled);
  const [shipping, setShipping] = useState(listing.shipping_cents != null ? (listing.shipping_cents / 100).toFixed(2) : (draft?.shipping_suggestion.suggested_shipping_usd ?? 9).toFixed(2));
  const [handling, setHandling] = useState(String(listing.handling_days ?? 2));
  const [pickupAddress, setPickupAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ai = Boolean(draft);
  const low = draft?.price_suggestion.low_usd;
  const high = draft?.price_suggestion.high_usd;
  const priceCents = Math.round(Number(price || 0) * 100);

  async function publish(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const body = {
        title,
        description,
        category,
        condition,
        brand: brand || null,
        attributes: Object.fromEntries(specs.filter((s) => s.key.trim() && s.value.trim()).map((s) => [s.key.trim(), s.value.trim()])),
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        price_cents: priceCents,
        area_label: area,
        zip,
        pickup_enabled: pickup,
        shipping_enabled: ship,
        shipping_cents: ship ? Math.round(Number(shipping) * 100) : null,
        handling_days: ship ? Number(handling) : null,
        pickup_address: pickup && pickupAddress ? pickupAddress : null,
      };
      const res = await fetch(`/api/listings/${listing.id}/publish`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(describe(data));
      router.push(`/listings/${listing.id}?published=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={publish} className="flex flex-wrap items-start gap-6">
      <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-4">
        <section className="card flex flex-col gap-4 p-5">
          <div className="grid grid-cols-4 gap-2.5">
            {listing.photos.map((p, i) => (
              <span key={p} className="relative aspect-square overflow-hidden rounded-xl bg-surface-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
                {i === 0 && <span className="absolute bottom-2 left-2 rounded-md bg-ink/75 px-2 py-0.5 text-[11px] font-semibold text-white">Cover</span>}
              </span>
            ))}
          </div>
          <Field label="Title" ai={ai} hint={`${title.length}/80`}>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} required />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category" ai={ai}>
              <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Brand" ai={ai}>
              <input className="input" value={brand} onChange={(e) => setBrand(e.target.value)} maxLength={60} />
            </Field>
          </div>
          <Field label="Condition" ai={ai} aiText={draft ? `AI suggests ${conditionLabel(draft.condition)}` : undefined}>
            <div className="flex flex-wrap gap-2">
              {CONDITIONS.map((c) => (
                <button key={c.id} type="button" onClick={() => setCondition(c.id)} className={condition === c.id ? "chip-on min-h-10 font-semibold" : "chip min-h-10 font-semibold"}>
                  {c.label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Description" ai={ai} hint={`${description.length}/1000 · shown to buyers and to AI agents as seller-provided text`}>
            <textarea className="input min-h-28 leading-relaxed" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} required />
          </Field>
          <Field label="Specs" ai={ai}>
            <div className="grid gap-2 sm:grid-cols-2">
              {specs.map((s, i) => (
                <div key={i} className="flex items-center gap-2 rounded-[10px] bg-surface px-2.5 py-2">
                  <input className="input min-h-9 bg-white px-2 py-1 text-[13px]" placeholder="format" value={s.key} onChange={(e) => setSpecs(specs.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))} />
                  <input className="input min-h-9 bg-white px-2 py-1 text-[13px]" placeholder="35mm" value={s.value} onChange={(e) => setSpecs(specs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
                  <button type="button" aria-label="Remove spec" className="h-8 w-8 shrink-0 rounded-md text-lg text-muted hover:bg-white" onClick={() => setSpecs(specs.filter((_, j) => j !== i))}>
                    ×
                  </button>
                </div>
              ))}
              <button type="button" className="min-h-10 rounded-[10px] border border-dashed border-line-2 bg-white text-[13px] font-semibold text-ink-2 hover:border-accent hover:text-accent" onClick={() => setSpecs([...specs, { key: "", value: "" }])}>
                + Add spec
              </button>
            </div>
          </Field>
          <Field label="Tags" ai={ai}>
            <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="film camera, 35mm, vintage" />
          </Field>
        </section>

        <section className="card flex flex-col gap-3.5 p-5">
          <h2 className="font-display text-xl font-extrabold">Set your price</h2>
          {draft && (
            <div className="tone-ai flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-sm leading-relaxed">
              <span className="badge-ai mt-0.5 bg-white">AI</span>
              <span>
                Suggests <strong>${low} – ${high}</strong>. {draft.price_suggestion.rationale}
              </span>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3.5">
            <label htmlFor="price" className="sr-only">
              Your price in USD
            </label>
            <span className="inline-flex items-center overflow-hidden rounded-xl border border-line-2 bg-white">
              <span className="px-3.5 font-display text-[22px] font-extrabold text-ink-2">$</span>
              <input id="price" className="min-h-[50px] w-[140px] border-0 py-3 pr-3.5 font-display text-[22px] font-bold text-ink outline-none" type="number" min={1} max={1000} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} required />
            </span>
            <span className="text-sm leading-relaxed text-ink-2">
              You receive <strong className="text-ink">{formatUsd(priceCents)}</strong> at <code className="mono text-[13px]">{payeeEmail}</code>
              <br />
              PayPal fees apply · no platform fee
            </span>
          </div>
        </section>

        <section className="card flex flex-col gap-4 p-5">
          <h2 className="font-display text-xl font-extrabold">Where and how?</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Pickup area (shown approximately)">
              <input className="input" value={area} onChange={(e) => setArea(e.target.value)} placeholder="Park Slope, Brooklyn" required />
            </Field>
            <Field label="ZIP code">
              <input className="input" value={zip} onChange={(e) => setZip(e.target.value)} pattern="\d{5}" placeholder="11215" inputMode="numeric" required />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={`flex cursor-pointer items-center gap-3 rounded-xl p-3.5 ${pickup ? "border-2 border-accent bg-accent-tint" : "border border-line-2"}`}>
              <input type="checkbox" className="h-[18px] w-[18px] accent-accent" checked={pickup} onChange={(e) => setPickup(e.target.checked)} />
              <span>
                <strong className="block text-sm">Local pickup</strong>
                <span className="text-[13px] text-ink-2">Free · exact address shared after payment</span>
              </span>
            </label>
            <label className={`flex cursor-pointer items-center gap-3 rounded-xl p-3.5 ${ship ? "border-2 border-accent bg-accent-tint" : "border border-line-2"}`}>
              <input type="checkbox" className="h-[18px] w-[18px] accent-accent" checked={ship} onChange={(e) => setShip(e.target.checked)} />
              <span>
                <strong className="block text-sm">Shipping</strong>
                <span className="text-[13px] text-ink-2">Flat cost added to the PayPal order</span>
              </span>
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {pickup && (
              <Field label={listing.has_pickup_address ? "Exact pickup address (saved; enter to replace)" : "Exact pickup address (private, shared only after payment)"}>
                <input className="input" value={pickupAddress} onChange={(e) => setPickupAddress(e.target.value)} placeholder="123 5th Ave, Apt 2, Brooklyn NY 11215" />
              </Field>
            )}
            {ship && (
              <>
                <Field label="Shipping cost" ai={ai} aiText={draft ? `AI suggests about $${draft.shipping_suggestion.suggested_shipping_usd} (${draft.shipping_suggestion.size_class.toLowerCase()} parcel)` : undefined}>
                  <span className="inline-flex w-full items-center overflow-hidden rounded-xl border border-line-2 bg-white">
                    <span className="px-3 text-ink-2">$</span>
                    <input className="min-h-[46px] min-w-0 flex-1 border-0 py-3 pr-3 text-[15px] text-ink outline-none" type="number" min={0} max={200} step="0.01" value={shipping} onChange={(e) => setShipping(e.target.value)} required />
                  </span>
                </Field>
                <Field label="Ships within">
                  <select className="input" value={handling} onChange={(e) => setHandling(e.target.value)}>
                    {[1, 2, 3, 4, 5].map((d) => (
                      <option key={d} value={d}>
                        {d} business day{d > 1 ? "s" : ""}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            )}
          </div>
        </section>

        {error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted">Published listings appear on the storefront and in MCP search for AI agents.</p>
          <div className="flex gap-2.5">
            <a href="/dashboard" className="btn-secondary min-h-12">
              Save draft
            </a>
            <button className="btn-primary min-h-12 px-6 text-[15px]" type="submit" disabled={busy}>
              {busy ? "Publishing…" : listing.status === "DRAFT" ? "Publish" : "Save changes"}
            </button>
          </div>
        </div>
      </div>

      <aside className="flex min-w-0 flex-[1_1_280px] flex-col gap-3.5 lg:max-w-[340px]">
        <div className="card flex flex-col gap-3 p-[18px]">
          <span className="eyebrow">Preview</span>
          <div className="overflow-hidden rounded-[14px] border border-line">
            <div className="aspect-[4/3] bg-surface-2">
              {listing.photos[0] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={listing.photos[0]} alt="" className="h-full w-full object-cover" />
              )}
            </div>
            <div className="flex flex-col gap-1 p-3 text-[13px]">
              <span className="flex justify-between gap-2">
                <strong className="text-sm">{title || "Untitled"}</strong>
                <strong>{formatUsd(priceCents)}</strong>
              </span>
              <span className="text-ink-2">
                {conditionLabel(condition)} · {area || "Area"}
              </span>
              <span className="text-ink-2">
                {pickup ? "Pickup free" : ""}
                {pickup && ship ? " · " : ""}
                {ship ? `Ships $${Number(shipping || 0).toFixed(2)}` : ""}
              </span>
              <span className="text-ink-2">
                {publicName(sellerName)} · {sellerRating != null ? `${sellerRating.toFixed(1)}★ (${sellerReviews})` : "New seller"}
              </span>
            </div>
          </div>
          <span className="text-xs text-muted">How the card looks to people and, as structured fields, to agents.</span>
        </div>
        {draft && (
          <div className="tone-dark flex flex-col gap-2.5 rounded-[18px] p-[18px]">
            <span className="eyebrow text-[#c4b5fd]">What the AI checked</span>
            <ul className="flex flex-col gap-2 text-[13px] leading-snug">
              {["Identified the item", "Read condition from the photos", "Checked similar sale prices", "Estimated parcel size for shipping", "No people, IDs or prohibited items"].map((t) => (
                <li key={t} className="flex gap-2">
                  <span className="text-[#86efac]">✓</span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </form>
  );
}

function Field({ label, ai, aiText, hint, children }: { label: string; ai?: boolean; aiText?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-ink-2">{label}</span>
        {ai && <span className="badge-ai">{aiText ?? "AI"}</span>}
        {hint && <span className="ml-auto text-xs font-medium text-muted">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
function describe(data: { error?: string; details?: { fieldErrors?: Record<string, string[]> } }): string {
  const fields = data.details?.fieldErrors;
  if (fields) {
    const msgs = Object.entries(fields).map(([k, v]) => `${k}: ${v.join(", ")}`);
    if (msgs.length) return msgs.join(" · ");
  }
  return data.error ?? "Request failed";
}
