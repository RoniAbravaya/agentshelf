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
    <div className="space-y-3">
      {view && !draft && (
        <div className="rounded-md bg-slate-50 p-3 text-sm">
          <div className="mb-1 font-medium">Current rules (v{current?.version})</div>
          <PolicySummary policy={current!.policy} homeLabel={homeLabel} />
          <div className="mt-1 text-xs text-slate-500">
            Spent this month: {formatUsd(view.spent_this_month_cents)} · remaining {formatUsd(view.remaining_monthly_cents)}
          </div>
        </div>
      )}
      <textarea className="input min-h-24" value={text} onChange={(e) => setText(e.target.value)} placeholder={EXAMPLE} maxLength={1500} />
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <input className="input" placeholder="Home ZIP (for pickup distance)" value={zip} onChange={(e) => setZip(e.target.value)} pattern="\d{5}" />
        <select className="input" value={provider} onChange={(e) => setProvider(e.target.value as Provider["id"])}>
          {providers.map((pr) => (
            <option key={pr.id} value={pr.id}>
              Parse with {pr.label}
            </option>
          ))}
        </select>
        <button className="btn-primary" type="button" onClick={parse} disabled={busy || text.trim().length < 5}>
          {busy ? "Parsing..." : "Turn into rules"}
        </button>
      </div>
      {!text && (
        <button type="button" className="text-xs text-slate-500 underline" onClick={() => setText(EXAMPLE)}>
          Use the example
        </button>
      )}
      {draft && p && (
        <div className="space-y-3 rounded-md border border-violet-200 bg-violet-50 p-4 text-sm">
          <div>
            <span className="badge-ai mr-2">AI</span>
            {draft.draft.summary}
          </div>
          <PolicySummary policy={p} homeLabel={p.home_geo?.label ?? null} />
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs">
              Max per order ($)
              <input className="input" type="number" value={p.max_per_order_cents / 100} onChange={(e) => setDraft({ ...draft, policy: { ...p, max_per_order_cents: Math.round(Number(e.target.value) * 100) } })} />
            </label>
            <label className="text-xs">
              Monthly cap ($)
              <input className="input" type="number" value={p.monthly_cap_cents / 100} onChange={(e) => setDraft({ ...draft, policy: { ...p, monthly_cap_cents: Math.round(Number(e.target.value) * 100) } })} />
            </label>
            <label className="text-xs">
              Ask me at or above ($, blank = never ask)
              <input className="input" type="number" value={p.auto_approve_below_cents == null ? "" : p.auto_approve_below_cents / 100} onChange={(e) => setDraft({ ...draft, policy: { ...p, auto_approve_below_cents: e.target.value === "" ? null : Math.round(Number(e.target.value) * 100) } })} />
            </label>
            <label className="text-xs">
              Min seller rating (blank = any)
              <input className="input" type="number" step="0.1" min={1} max={5} value={p.min_seller_rating ?? ""} onChange={(e) => setDraft({ ...draft, policy: { ...p, min_seller_rating: e.target.value === "" ? null : Number(e.target.value) } })} />
            </label>
            <label className="text-xs">
              Max pickup distance (km, blank = no limit)
              <input className="input" type="number" value={p.max_pickup_km ?? ""} onChange={(e) => setDraft({ ...draft, policy: { ...p, max_pickup_km: e.target.value === "" ? null : Number(e.target.value) } })} />
            </label>
            <label className="text-xs">
              Max shipping cost ($, blank = no limit)
              <input className="input" type="number" value={p.max_shipping_cents == null ? "" : p.max_shipping_cents / 100} onChange={(e) => setDraft({ ...draft, policy: { ...p, max_shipping_cents: e.target.value === "" ? null : Math.round(Number(e.target.value) * 100) } })} />
            </label>
          </div>
          <div className="flex flex-wrap gap-1">
            {CATEGORIES.map((c) => {
              const on = p.allowed_categories.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`rounded-full border px-2 py-0.5 text-xs ${on ? "border-brand bg-brand text-white" : "border-slate-300 bg-white"}`}
                  onClick={() => setDraft({ ...draft, policy: { ...p, allowed_categories: on ? p.allowed_categories.filter((x) => x !== c.id) : [...p.allowed_categories, c.id] } })}
                >
                  {c.label}
                </button>
              );
            })}
            <span className="self-center text-xs text-slate-500">{p.allowed_categories.length === 0 ? "(any category)" : ""}</span>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" type="button" onClick={save} disabled={busy}>
              Confirm and save rules
            </button>
            <button className="btn-secondary" type="button" onClick={() => setDraft(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      {saved && <p className="rounded-md bg-green-50 p-2 text-sm text-green-800">{saved}</p>}
    </div>
  );
}

function PolicySummary({ policy: p, homeLabel }: { policy: SpendPolicy; homeLabel: string | null }) {
  return (
    <ul className="list-disc pl-5 text-sm">
      <li>Max {formatUsd(p.max_per_order_cents)} per order, {formatUsd(p.monthly_cap_cents)} per month</li>
      <li>{p.auto_approve_below_cents == null ? "Pay automatically within the caps" : `Pay automatically below ${formatUsd(p.auto_approve_below_cents)}; ask me at or above`}</li>
      <li>{p.allowed_categories.length ? `Only: ${p.allowed_categories.map(categoryLabel).join(", ")}` : "Any category"}</li>
      <li>
        Pickup {p.allow_pickup ? (p.max_pickup_km != null ? `within ${p.max_pickup_km} km${homeLabel ? ` of ${homeLabel}` : " of home"}` : "allowed") : "not allowed"}; shipping {p.allow_shipping ? (p.max_shipping_cents != null ? `up to ${formatUsd(p.max_shipping_cents)}` : "allowed") : "not allowed"}
      </li>
      {p.min_seller_rating != null && <li>Sellers rated {p.min_seller_rating}+ only</li>}
      {p.blocked_keywords.length > 0 && <li>Never buy: {p.blocked_keywords.join(", ")}</li>}
    </ul>
  );
}
