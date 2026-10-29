"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CATEGORIES, categoryLabel, formatUsd, type AiPolicyDraft, type PolicyViewOutput, type SpendPolicy } from "@agentshelf/shared";

type Provider = { id: "anthropic" | "openai" | "stub"; label: string; model: string };

const EXAMPLE = "Vintage cameras, max $120 each, $300 a month, ask me above $100. Pickup within 10 km, or shipping under $15. Sellers rated 4.5+.";

export function MandateEditor({ providers, current, view, homeLabel }: { providers: Provider[]; current: { policy: SpendPolicy; version: number } | null; view: PolicyViewOutput | null; homeLabel: string | null }) {
  const router = useRouter();
  const [text, setText] = useState(current?.policy.source_text ?? "");
  const [zip, setZip] = useState("");
  const [provider, setProvider] = useState<Provider["id"]>(providers[0]?.id ?? "stub");
  const [draft, setDraft] = useState<{ draft: AiPolicyDraft; policy: SpendPolicy; provider: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  async function parse() {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const res = await fetch("/api/policy/parse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, home_zip: zip || undefined, provider }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not parse rules");
      setDraft(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/policy", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft.policy) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save");
      setSaved(`Saved as version ${data.version}. Hard platform ceilings still apply.`);
      setDraft(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const p = draft?.policy;
  return (
    <div className="flex flex-col gap-3.5">
      <div>
        <label htmlFor="rules" className="label">
          Write them in plain English
        </label>
        <textarea id="rules" className="input min-h-24 leading-relaxed" value={text} onChange={(e) => setText(e.target.value)} placeholder={EXAMPLE} maxLength={1500} />
        {!text && (
          <button type="button" className="mt-1 text-xs text-muted underline" onClick={() => setText(EXAMPLE)}>
            Use the example
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <label htmlFor="homezip" className="sr-only">
          Home ZIP
        </label>
        <input id="homezip" className="input w-[150px]" placeholder="Home ZIP" value={zip} onChange={(e) => setZip(e.target.value)} pattern="\d{5}" inputMode="numeric" />
        <span className="text-[13px] text-muted">Home area for pickup distance</span>
        <select className="input w-auto" value={provider} onChange={(e) => setProvider(e.target.value as Provider["id"])}>
          {providers.map((pr) => (
            <option key={pr.id} value={pr.id}>
              Parse with {pr.label}
            </option>
          ))}
        </select>
        <button className="btn-dark sm:ml-auto" type="button" onClick={parse} disabled={busy || text.trim().length < 5}>
          {busy && !draft ? "Parsing…" : "Turn into rules"}
        </button>
      </div>

      {current && !draft && (
        <div className="rounded-[14px] bg-surface p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-semibold">Current rules</span>
            {view && (
              <span className="text-xs text-muted">
                Spent this month {formatUsd(view.spent_this_month_cents)} · remaining {formatUsd(view.remaining_monthly_cents)}
              </span>
            )}
          </div>
          <RuleTiles policy={current.policy} homeLabel={homeLabel} />
        </div>
      )}

      {draft && p && (
        <div className="tone-ai flex flex-col gap-3 rounded-[14px] p-4">
          <div className="flex items-start gap-2.5 text-sm leading-relaxed">
            <span className="badge-ai mt-0.5 bg-white">AI</span>
            <span>{draft.draft.summary}</span>
          </div>
          <RuleTiles policy={p} homeLabel={p.home_geo?.label ?? null} />
          <div className="grid gap-2 sm:grid-cols-2">
            <Num label="Max per order ($)" value={p.max_per_order_cents / 100} onChange={(v) => setDraft({ ...draft, policy: { ...p, max_per_order_cents: Math.round((v ?? 0) * 100) } })} />
            <Num label="Monthly cap ($)" value={p.monthly_cap_cents / 100} onChange={(v) => setDraft({ ...draft, policy: { ...p, monthly_cap_cents: Math.round((v ?? 0) * 100) } })} />
            <Num label="Ask me at or above ($, blank = never ask)" value={p.auto_approve_below_cents == null ? null : p.auto_approve_below_cents / 100} onChange={(v) => setDraft({ ...draft, policy: { ...p, auto_approve_below_cents: v == null ? null : Math.round(v * 100) } })} />
            <Num label="Min seller rating (blank = any)" value={p.min_seller_rating} step={0.1} onChange={(v) => setDraft({ ...draft, policy: { ...p, min_seller_rating: v } })} />
            <Num label="Max pickup distance (km, blank = no limit)" value={p.max_pickup_km} onChange={(v) => setDraft({ ...draft, policy: { ...p, max_pickup_km: v } })} />
            <Num label="Max shipping cost ($, blank = no limit)" value={p.max_shipping_cents == null ? null : p.max_shipping_cents / 100} onChange={(v) => setDraft({ ...draft, policy: { ...p, max_shipping_cents: v == null ? null : Math.round(v * 100) } })} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => {
              const on = p.allowed_categories.includes(c.id);
              return (
                <button key={c.id} type="button" className={on ? "chip-on min-h-8 text-xs" : "chip min-h-8 text-xs"} onClick={() => setDraft({ ...draft, policy: { ...p, allowed_categories: on ? p.allowed_categories.filter((x) => x !== c.id) : [...p.allowed_categories, c.id] } })}>
                  {c.label}
                </button>
              );
            })}
            <span className="self-center text-xs text-muted">{p.allowed_categories.length === 0 ? "(any category)" : ""}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button className="btn-primary" type="button" onClick={save} disabled={busy}>
              Confirm and save rules
            </button>
            <button className="btn-secondary" type="button" onClick={() => setDraft(null)}>
              Cancel
            </button>
            <span className="text-xs text-muted">Hard platform ceilings still apply: $1,000 per order, $5,000 per month.</span>
          </div>
        </div>
      )}
      {error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      {saved && <p className="rounded-xl bg-ok-soft px-3 py-2 text-sm text-ok">{saved}</p>}
    </div>
  );
}

function Num({ label, value, step, onChange }: { label: string; value: number | null; step?: number; onChange: (v: number | null) => void }) {
  return (
    <label className="text-xs text-ink-2">
      {label}
      <input className="input mt-1" type="number" step={step ?? 1} value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} />
    </label>
  );
}

function RuleTiles({ policy: p, homeLabel }: { policy: SpendPolicy; homeLabel: string | null }) {
  const tiles = [
    { k: "Per order", v: formatUsd(p.max_per_order_cents) },
    { k: "Per month", v: formatUsd(p.monthly_cap_cents) },
    { k: "Ask me at", v: p.auto_approve_below_cents == null ? "never" : `${formatUsd(p.auto_approve_below_cents)}+` },
    { k: "Categories", v: p.allowed_categories.length ? p.allowed_categories.map(categoryLabel).join(", ") : "Any" },
    { k: "Pickup", v: p.allow_pickup ? (p.max_pickup_km != null ? `≤ ${p.max_pickup_km} km${homeLabel ? ` of ${homeLabel}` : ""}` : "allowed") : "not allowed" },
    { k: "Shipping", v: p.allow_shipping ? (p.max_shipping_cents != null ? `≤ ${formatUsd(p.max_shipping_cents)}` : "allowed") : "not allowed" },
    { k: "Seller rating", v: p.min_seller_rating != null ? `${p.min_seller_rating}★+` : "any" },
  ];
  if (p.blocked_keywords.length) tiles.push({ k: "Never buy", v: p.blocked_keywords.join(", ") });
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
      {tiles.map((t) => (
        <div key={t.k} className="flex flex-col gap-0.5 rounded-[10px] border border-line bg-white px-3 py-2.5">
          <span className="eyebrow">{t.k}</span>
          <span className="text-[15px] font-bold leading-snug">{t.v}</span>
        </div>
      ))}
    </div>
  );
}
