"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function MessageSellerButton({ listingId, signedIn }: { listingId: string; signedIn: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!signedIn) {
    return (
      <a className="btn-secondary w-full" href={`/login?next=${encodeURIComponent(`/listings/${listingId}`)}`}>
        Sign in to message the seller
      </a>
    );
  }
  if (!open) {
    return (
      <button className="btn-secondary w-full" type="button" onClick={() => setOpen(true)}>
        Message seller
      </button>
    );
  }
  async function send() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listing_id: listingId, text }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not send");
      router.push(`/inbox/${data.conversation_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }
  return (
    <div className="card flex flex-col gap-2.5 p-4">
      <textarea className="input" rows={3} placeholder="Does the light meter work?" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} />
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <button className="btn-primary" type="button" onClick={send} disabled={busy || !text.trim()}>
          Send
        </button>
        <button className="btn-secondary" type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      <p className="text-xs text-muted">In-app chat only; no phone or email is exposed.</p>
    </div>
  );
}
