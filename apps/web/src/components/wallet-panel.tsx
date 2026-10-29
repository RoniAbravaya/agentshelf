"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Wallet = { status: "ACTIVE" | "MISSING" | "DELETED" | "PENDING"; payer_email: string | null; created_at: string | null };

export function WalletPanel({ wallet, paypalMode }: { wallet: Wallet; paypalMode: "sandbox" | "live" | "mock" | "none" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/wallet/setup-token", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start PayPal setup");
      window.location.href = data.approval_url;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }
  async function remove() {
    if (!confirm("Remove the saved PayPal wallet? Agent purchases will be blocked until you save it again.")) return;
    setBusy(true);
    try {
      await fetch("/api/wallet/delete", { method: "POST" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex flex-wrap items-center gap-3.5 rounded-xl border border-line px-4 py-3.5">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-[10px] bg-paypal text-ink">
          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="5" width="20" height="14" rx="3" />
            <path d="M2 10h20" />
          </svg>
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          {wallet.status === "ACTIVE" ? (
            <>
              <strong className="text-[15px]">PayPal{wallet.payer_email ? ` · ${wallet.payer_email}` : ""}</strong>
              <span className="text-[13px] text-ink-2">Saved {wallet.created_at ? new Date(wallet.created_at).toLocaleDateString() : ""} via Vault. Token stored encrypted on the server; the agent never sees it.</span>
            </>
          ) : (
            <>
              <strong className="text-[15px]">{wallet.status === "DELETED" ? "Wallet removed" : "No wallet saved yet"}</strong>
              <span className="text-[13px] text-ink-2">Approve once in PayPal (Vault setup token) so your agent can pay without a redirect. Nothing is charged now.</span>
            </>
          )}
        </span>
        {wallet.status !== "ACTIVE" ? (
          <button className="btn-accent min-h-11 text-sm sm:ml-auto" type="button" onClick={connect} disabled={busy || paypalMode === "none"}>
            {busy ? "Opening PayPal…" : "Connect PayPal"}
          </button>
        ) : (
          <button className="btn-danger sm:ml-auto" type="button" onClick={remove} disabled={busy}>
            Remove wallet
          </button>
        )}
      </div>
      <span className="text-[13px] text-muted">Purchases within your rules and below the ask-me limit are paid instantly. Above it, you get a one-tap PayPal approval link.</span>
      {paypalMode === "mock" && <p className="text-xs text-warn">Sandbox not configured: a simulated PayPal approval page is used.</p>}
      {error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-danger">{error}</p>}
    </div>
  );
}
