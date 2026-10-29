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
 * On phones the delivery choice and pay button sit in a sticky bottom bar.
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
          style: { layout: "vertical", shape: "pill", label: "pay" },
          createOrder: () =>
            createOrder().catch((e) => {
              setError(e.message);
              throw e;
            }),
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

  const deliveryChoice = (
    <fieldset className="flex flex-col gap-2 border-0 p-0">
      <legend className="eyebrow mb-2">Delivery</legend>
      {props.pickup && (
        <label className={`flex min-h-12 cursor-pointer items-center justify-between gap-2.5 rounded-xl px-3.5 text-sm ${fulfillment === "PICKUP" ? "border-2 border-accent bg-accent-tint" : "border border-line-2"}`}>
          <span className="flex items-center gap-2.5">
            <input type="radio" name="fulfillment" className="h-[18px] w-[18px] accent-accent" checked={fulfillment === "PICKUP"} onChange={() => setFulfillment("PICKUP")} disabled={!available} /> Local pickup
          </span>
          <strong>Free</strong>
        </label>
      )}
      {props.shippingCents != null && (
        <label className={`flex min-h-12 cursor-pointer items-center justify-between gap-2.5 rounded-xl px-3.5 text-sm ${fulfillment === "SHIP" ? "border-2 border-accent bg-accent-tint" : "border border-line-2"}`}>
          <span className="flex items-center gap-2.5">
            <input type="radio" name="fulfillment" className="h-[18px] w-[18px] accent-accent" checked={fulfillment === "SHIP"} onChange={() => setFulfillment("SHIP")} disabled={!available} /> Shipping
          </span>
          <strong>{formatUsd(props.shippingCents)}</strong>
        </label>
      )}
    </fieldset>
  );

  const payControl = (
    <>
      {available && props.paypalMode === "mock" && (
        <button className="btn-accent w-full" onClick={simulate} disabled={busy} type="button">
          {busy ? "Starting…" : `Simulate PayPal payment · ${formatUsd(total)}`}
        </button>
      )}
      {available && props.paypalMode !== "mock" && props.paypalClientId && <div ref={buttonsRef} className="min-h-12" />}
      {available && props.paypalMode === "none" && <p className="text-sm text-danger">PayPal is not configured on this server.</p>}
    </>
  );

  return (
    <>
      <div className="card-raised flex flex-col gap-3.5 p-5">
        {!available && <div className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-ink-2">This item is {props.status.toLowerCase()}.</div>}
        {deliveryChoice}
        <div className="flex items-baseline justify-between border-t border-line pt-3.5">
          <span className="text-sm text-ink-2">Total</span>
          <span className="font-display text-[26px] font-extrabold">{formatUsd(total)}</span>
        </div>
        <div className="hidden md:block">{payControl}</div>
        {error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        <p className="text-xs leading-relaxed text-muted">
          {props.signedIn ? "The order will appear in your account." : "You can pay as a guest; sign in to keep the order in your account and chat with the seller."} Paid directly to the seller&apos;s PayPal account. The item is reserved for 10 minutes while you pay. PayPal buyer protection applies.
        </p>
      </div>
      {available && (
        <div className="fixed inset-x-0 bottom-[60px] z-20 border-t border-line bg-white px-4 pb-2 pt-2.5 md:hidden">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-ink-2">{fulfillment === "PICKUP" ? "Local pickup · free" : `Shipping · ${formatUsd(props.shippingCents ?? 0)}`}</span>
            <span className="font-display text-xl font-extrabold">{formatUsd(total)}</span>
          </div>
          {payControl}
        </div>
      )}
    </>
  );
}
