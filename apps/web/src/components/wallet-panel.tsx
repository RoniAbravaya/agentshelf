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
    <div className="space-y-2 text-sm">
      {wallet.status === "ACTIVE" ? (
        <p>
          <span className="badge bg-green-100 text-green-800">Saved</span> PayPal wallet {wallet.payer_email ? <code>{wallet.payer_email}</code> : ""} saved on {wallet.created_at ? new Date(wallet.created_at).toLocaleDateString() : ""}. The payment token is stored encrypted on the server.
        </p>
      ) : (
        <p className="text-slate-600">
          {wallet.status === "DELETED" ? "Your saved wallet was removed. " : ""}
          Approve once in PayPal (Vault v3 setup token) so your agent can pay without a redirect. Nothing is charged now.
        </p>
      )}
      {paypalMode === "mock" && <p className="text-xs text-amber-700">Sandbox not configured: a simulated PayPal approval page is used.</p>}
      <div className="flex gap-2">
        {wallet.status !== "ACTIVE" ? (
          <button className="btn-accent" type="button" onClick={connect} disabled={busy || paypalMode === "none"}>
            {busy ? "Opening PayPal..." : "Connect PayPal"}
          </button>
        ) : (
          <button className="btn-danger" type="button" onClick={remove} disabled={busy}>
            Remove wallet
          </button>
        )}
      </div>
      {error && <p className="rounded-md bg-red-50 p-2 text-red-700">{error}</p>}
    </div>
  );
}
