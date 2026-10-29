"use client";

import { useState } from "react";

export function SellerSettingsForm({ initial }: { initial: { display_name: string; paypal_payee_email: string; has_phone: boolean; share_contact_after_purchase: boolean; bio: string } }) {
  const [name, setName] = useState(initial.display_name);
  const [payee, setPayee] = useState(initial.paypal_payee_email);
  const [phone, setPhone] = useState("");
  const [share, setShare] = useState(initial.share_contact_after_purchase);
  const [bio, setBio] = useState(initial.bio);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/sellers/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: name, paypal_payee_email: payee, contact_phone: phone || undefined, share_contact_after_purchase: share, bio: bio || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save");
      setMsg("Saved.");
      setPhone("");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="space-y-4 pt-3">
      <div>
        <label className="label">Display name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} minLength={2} required />
        <p className="mt-1 text-xs text-slate-500">Shown to buyers as first name + initial, e.g. Maya A.</p>
      </div>
      <div>
        <label className="label">PayPal email that receives payments (sandbox)</label>
        <input className="input" type="email" value={payee} onChange={(e) => setPayee(e.target.value)} required />
      </div>
      <div>
        <label className="label">Phone / WhatsApp (optional, encrypted){initial.has_phone ? " - saved; enter to replace" : ""}</label>
        <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 718 555 0142" />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} /> Show my phone/WhatsApp to buyers after they pay (in-app chat is always on)
      </label>
      <div>
        <label className="label">Short bio</label>
        <input className="input" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={300} />
      </div>
      {msg && <p className="text-sm text-slate-700">{msg}</p>}
      <button className="btn-primary" disabled={busy} type="submit">
        Save
      </button>
    </form>
  );
}
