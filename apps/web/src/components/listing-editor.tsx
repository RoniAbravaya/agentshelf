"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CATEGORIES, CONDITIONS, formatUsd, type AiListingDraft } from "@agentshelf/shared";

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

export function ListingEditor({ listing, draft, payeeEmail }: { listing: EditorListing; draft: AiListingDraft | null; payeeEmail: string }) {
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

  const low = draft?.price_suggestion.low_usd;
  const high = draft?.price_suggestion.high_usd;

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
        price_cents: Math.round(Number(price) * 100),
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
    <form onSubmit={publish} className="space-y-4">
      <section className="card p-5">
        <div className="grid grid-cols-4 gap-2">
          {listing.photos.map((p, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={p} src={p} alt={`Photo ${i + 1}`} className="aspect-square w-full rounded-lg object-cover" />
          ))}
        </div>
      </section>

      <section className="card space-y-4 p-5">
        <Field label="Title" ai>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} required />
          <Hint>{title.length}/80</Hint>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" ai>
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Brand" ai>
            <input className="input" value={brand} onChange={(e) => setBrand(e.target.value)} maxLength={60} />
          </Field>
        </div>
        <Field label="Condition" ai>
          <div className="flex flex-wrap gap-2">
            {CONDITIONS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCondition(c.id)}
                className={`rounded-full border px-3 py-1 text-sm ${condition === c.id ? "border-brand bg-brand text-white" : "border-slate-300 bg-white hover:bg-slate-50"}`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Description" ai>
          <textarea className="input min-h-28" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} required />
          <Hint>{description.length}/1000 · shown to buyers and to AI agents as seller-provided text</Hint>
        </Field>
        <Field label="Specs" ai>
          <div className="space-y-2">
            {specs.map((s, i) => (
              <div key={i} className="flex gap-2">
                <input className="input" placeholder="format" value={s.key} onChange={(e) => setSpecs(specs.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))} />
                <input className="input" placeholder="35mm" value={s.value} onChange={(e) => setSpecs(specs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
                <button type="button" className="btn-secondary" onClick={() => setSpecs(specs.filter((_, j) => j !== i))}>
                  ×
                </button>
              </div>
            ))}
            <button type="button" className="btn-secondary" onClick={() => setSpecs([...specs, { key: "", value: "" }])}>
              + Add spec
            </button>
          </div>
        </Field>
        <Field label="Tags" ai>
          <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="film camera, 35mm, vintage" />
        </Field>
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="font-semibold">Set your price</h2>
        {draft && (
          <p className="rounded-md bg-violet-50 p-3 text-sm text-violet-900">
            <span className="badge-ai mr-2">AI</span>
            Suggests <strong>${low} - ${high}</strong>. {draft.price_suggestion.rationale}
          </p>
        )}
        <div className="flex items-center gap-3">
          <span className="text-xl font-semibold">$</span>
          <input className="input max-w-40 text-lg" type="number" min={1} max={1000} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} required />
          <span className="text-sm text-slate-600">
            You receive <strong>{formatUsd(Math.round(Number(price || 0) * 100))}</strong> at <code>{payeeEmail}</code> (PayPal fees apply, no platform fee)
          </span>
        </div>
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="font-semibold">Where and how?</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Pickup area (shown approximately)">
            <input className="input" value={area} onChange={(e) => setArea(e.target.value)} placeholder="Park Slope, Brooklyn" required />
          </Field>
          <Field label="ZIP code">
            <input className="input" value={zip} onChange={(e) => setZip(e.target.value)} pattern="\d{5}" placeholder="11215" required />
          </Field>
        </div>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={pickup} onChange={(e) => setPickup(e.target.checked)} /> Local pickup (free)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={ship} onChange={(e) => setShip(e.target.checked)} /> Shipping
          </label>
        </div>
        {pickup && (
          <Field label={listing.has_pickup_address ? "Exact pickup address (saved; enter to replace)" : "Exact pickup address (private, shared only after payment)"}>
            <input className="input" value={pickupAddress} onChange={(e) => setPickupAddress(e.target.value)} placeholder="123 5th Ave, Apt 2, Brooklyn NY 11215" />
          </Field>
        )}
        {ship && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Shipping cost (flat, added to the PayPal order)" ai={Boolean(draft)}>
              <div className="flex items-center gap-2">
                <span>$</span>
                <input className="input" type="number" min={0} max={200} step="0.01" value={shipping} onChange={(e) => setShipping(e.target.value)} required />
              </div>
              {draft && (
                <Hint>
                  AI suggests about ${draft.shipping_suggestion.suggested_shipping_usd} ({draft.shipping_suggestion.size_class.toLowerCase()} parcel)
                </Hint>
              )}
            </Field>
            <Field label="Ships within (business days)">
              <select className="input" value={handling} onChange={(e) => setHandling(e.target.value)}>
                {[1, 2, 3, 4, 5].map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
      </section>

      {error && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">Published listings appear on the storefront and in MCP search for AI agents.</p>
        <button className="btn-primary" type="submit" disabled={busy}>
          {busy ? "Publishing..." : listing.status === "DRAFT" ? "Publish" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

function Field({ label, ai, children }: { label: string; ai?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <span className="label mb-0">{label}</span>
        {ai && <span className="badge-ai">AI</span>}
      </div>
      {children}
    </div>
  );
}
function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-xs text-slate-500">{children}</p>;
}
function describe(data: { error?: string; details?: { fieldErrors?: Record<string, string[]> } }): string {
  const fields = data.details?.fieldErrors;
  if (fields) {
    const msgs = Object.entries(fields).map(([k, v]) => `${k}: ${v.join(", ")}`);
    if (msgs.length) return msgs.join(" · ");
  }
  return data.error ?? "Request failed";
}
