"use client";

import { useEffect, useRef, useState } from "react";
import { formatUsd } from "@agentshelf/shared";

type Fulfillment = "PICKUP" | "SHIP";

declare global {
  interface Window {
    paypal?: {
      Buttons: (opts: Record<string, unknown>) => { render: (el: HTMLElement) => Promise<void>; close?: () => void };
    };
  }
}

/**
 * Human buyer checkout. With a real sandbox client id it renders PayPal Smart
 * Buttons (createOrder on our server, capture on our server). In mock mode it
 * shows a "Simulate PayPal payment" button that walks the same server path.
 */
export function CheckoutPanel(props: {
  listingId: string;
  status: string;
  priceCents: number;
  pickup: boolean;
  shippingCents: number | null;
  paypalClientId: string | null;
  paypalMode: "sandbox" | "live" | "mock" | "none";
  signedIn: boolean;
}) {
  const [fulfillment, setFulfillment] = useState<Fulfillment>(props.pickup ? "PICKUP" : "SHIP");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const buttonsRef = useRef<HTMLDivElement>(null);
  const fulfillmentRef = useRef(fulfillment);
  fulfillmentRef.current = fulfillment;
  const total = props.priceCents + (fulfillment === "SHIP" ? (props.shippingCents ?? 0) : 0);
  const available = props.status === "AVAILABLE";

  async function createOrder(): Promise<string> {
    const res = await fetch("/api/checkout/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listing_id: props.listingId, fulfillment: fulfillmentRef.current }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Could not start checkout");
    return data.paypal_order_id as string;
  }

  async function capture(paypalOrderId: string): Promise<void> {
    const res = await fetch(`/api/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Payment could not be captured");
    window.location.href = `/orders/${data.order.id}?paid=1`;
  }

  // Real PayPal JS SDK buttons
  useEffect(() => {
    if (!props.paypalClientId || !available || props.paypalMode === "mock") return;
    const el = buttonsRef.current;
    if (!el) return;
    let cancelled = false;
    function render() {
      if (cancelled || !window.paypal || !el) return;
      el.innerHTML = "";
      window.paypal
        .Buttons({
          style: { layout: "vertical", shape: "rect", label: "pay" },
          createOrder: () => createOrder().catch((e) => { setError(e.message); throw e; }),
          onApprove: (data: { orderID: string }) => capture(data.orderID).catch((e) => setError(e.message)),
          onCancel: () => setError("Checkout cancelled. The item stays reserved for a few minutes."),
          onError: (err: unknown) => setError(err instanceof Error ? err.message : "PayPal error"),
        })
        .render(el)
        .catch(() => {});
    }
    if (window.paypal) render();
    else {
      const s = document.createElement("script");
      s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(props.paypalClientId)}&currency=USD&intent=capture&components=buttons`;
      s.async = true;
      s.onload = render;
      s.onerror = () => setError("Could not load the PayPal SDK");
      document.body.appendChild(s);
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.paypalClientId, available]);

  async function simulate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listing_id: props.listingId, fulfillment }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start checkout");
      window.location.href = data.approval_url;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-3 p-5">
      {!available && <div className="rounded-md bg-slate-100 p-2 text-sm text-slate-600">This item is {props.status.toLowerCase()}.</div>}
      <div className="space-y-2">
        <div className="label">Delivery</div>
        {props.pickup && (
          <label className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <span className="flex items-center gap-2">
              <input type="radio" name="fulfillment" checked={fulfillment === "PICKUP"} onChange={() => setFulfillment("PICKUP")} disabled={!available} /> Local pickup
            </span>
            <span>free</span>
          </label>
        )}
        {props.shippingCents != null && (
          <label className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <span className="flex items-center gap-2">
              <input type="radio" name="fulfillment" checked={fulfillment === "SHIP"} onChange={() => setFulfillment("SHIP")} disabled={!available} /> Shipping
            </span>
            <span>{formatUsd(props.shippingCents)}</span>
          </label>
        )}
      </div>
      <div className="flex items-center justify-between border-t border-slate-100 pt-3">
        <span className="text-sm text-slate-600">Total</span>
        <span className="text-xl font-bold">{formatUsd(total)}</span>
      </div>
      {available && props.paypalMode === "mock" && (
        <button className="btn-accent w-full" onClick={simulate} disabled={busy} type="button">
          {busy ? "Starting..." : "Simulate PayPal payment"}
        </button>
      )}
      {available && props.paypalMode !== "mock" && props.paypalClientId && <div ref={buttonsRef} />}
      {available && props.paypalMode === "none" && <p className="text-sm text-red-700">PayPal is not configured on this server.</p>}
      {error && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      <p className="text-xs text-slate-500">
        {props.signedIn ? "The order will appear in your account." : "You can pay as a guest; sign in to keep the order in your account and chat with the seller."} Payment goes directly to the seller's PayPal account; the item is reserved for 10 minutes while you pay.
      </p>
    </div>
  );
}
