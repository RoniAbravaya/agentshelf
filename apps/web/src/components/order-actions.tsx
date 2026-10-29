"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatUsd } from "@agentshelf/shared";

export function OrderActions(props: { orderId: string; role: "buyer" | "seller"; status: string; fulfillment: "PICKUP" | "SHIP"; reviewed: boolean; totalCents: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tracking, setTracking] = useState("");
  const [carrier, setCarrier] = useState("USPS");
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState("");

  async function post(path: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const paid = ["PAID", "SHIPPED", "PICKED_UP", "COMPLETED"].includes(props.status);
  const actions: React.ReactNode[] = [];

  if (props.role === "seller" && props.fulfillment === "SHIP" && (props.status === "PAID" || props.status === "SHIPPED")) {
    actions.push(
      <form
        key="tracking"
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void post(`/api/orders/${props.orderId}/tracking`, { tracking_number: tracking, carrier });
        }}
      >
        <div>
          <label className="label">Tracking number</label>
          <input className="input" value={tracking} onChange={(e) => setTracking(e.target.value)} required />
        </div>
        <div>
          <label className="label">Carrier</label>
          <select className="input" value={carrier} onChange={(e) => setCarrier(e.target.value)}>
            {["USPS", "UPS", "FEDEX", "DHL", "OTHER"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <button className="btn-primary" disabled={busy} type="submit">
          {props.status === "SHIPPED" ? "Update tracking" : "Mark shipped"}
        </button>
      </form>,
    );
  }
  if (props.role === "buyer" && props.status === "PENDING_APPROVAL") {
    actions.push(
      <button
        key="cancel"
        className="btn-danger"
        disabled={busy}
        type="button"
        onClick={() => {
          if (confirm("Cancel this order? Nothing has been charged; the item and your budget are released.")) void post(`/api/orders/${props.orderId}/cancel`);
        }}
      >
        Cancel this order
      </button>,
    );
  }
  if (props.role === "buyer" && props.fulfillment === "PICKUP" && props.status === "PAID") {
    actions.push(
      <button key="collected" className="btn-primary" disabled={busy} type="button" onClick={() => post(`/api/orders/${props.orderId}/collected`)}>
        I collected the item
      </button>,
    );
  }
  if (props.role === "seller" && paid) {
    actions.push(
      <button
        key="refund"
        className="btn-danger"
        disabled={busy}
        type="button"
        onClick={() => {
          if (confirm(`Refund ${formatUsd(props.totalCents)} to the buyer through PayPal?`)) void post(`/api/orders/${props.orderId}/refund`, { note: "Refunded by seller" });
        }}
      >
        Refund {formatUsd(props.totalCents)}
      </button>,
    );
  }
  if (props.role === "buyer" && paid && !props.reviewed) {
    actions.push(
      <form
        key="review"
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          void post(`/api/orders/${props.orderId}/review`, { stars, comment });
        }}
      >
        <div className="label">Rate the seller</div>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((s) => (
            <button key={s} type="button" onClick={() => setStars(s)} className={`text-2xl ${s <= stars ? "text-amber-500" : "text-slate-300"}`} aria-label={`${s} stars`}>
              ★
            </button>
          ))}
        </div>
        <input className="input" placeholder="Short review (optional)" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} />
        <button className="btn-primary" disabled={busy} type="submit">
          Submit review
        </button>
      </form>,
    );
  }
  if (props.role === "buyer" && props.reviewed) actions.push(<p key="reviewed" className="text-sm text-slate-500">You rated this order. Thanks!</p>);

  if (actions.length === 0 && !error) return null;
  return (
    <div className="card space-y-3 p-5">
      {actions}
      {error && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
