"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
 * Human buyer checkout without any agent.
 * - Real sandbox: PayPal Smart Buttons (createOrder and capture on our server),
 *   rendered in the desktop card and in the phone's sticky bar. If the PayPal
 *   script does not load, a "Pay on PayPal.com" button uses the redirect flow
 *   (server creates the order, PayPal approval page, our return URL captures).
 * - Mock mode: "Simulate PayPal payment" walks the same server path.
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
  const [sdk, setSdk] = useState<"loading" | "ready" | "failed">("loading");
  const desktopRef = useRef<HTMLDivElement>(null);
  const mobileRef = useRef<HTMLDivElement>(null);
  const fulfillmentRef = useRef(fulfillment);
  fulfillmentRef.current = fulfillment;
  const total = props.priceCents + (fulfillment === "SHIP" ? (props.shippingCents ?? 0) : 0);
  const available = props.status === "AVAILABLE";
  const smartButtons = available && props.paypalMode !== "mock" && props.paypalMode !== "none" && Boolean(props.paypalClientId);

  const createOrder = useCallback(async (): Promise<{ paypal_order_id: string; approval_url: string | null }> => {
    const res = await fetch("/api/checkout/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listing_id: props.listingId, fulfillment: fulfillmentRef.current }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Could not start checkout");
    return data;
  }, [props.listingId]);

  async function capture(paypalOrderId: string): Promise<void> {
    const res = await fetch(`/api/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Payment could not be captured");
    window.location.href = `/orders/${data.order.id}?paid=1`;
  }

  // Load the PayPal JS SDK once and render Smart Buttons into every visible container.
  useEffect(() => {
    if (!smartButtons || !props.paypalClientId) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled && !window.paypal) setSdk("failed");
    }, 8000);
    const opts = {
      style: { layout: "vertical", shape: "pill", label: "pay" },
      createOrder: () =>
        createOrder()
          .then((d) => d.paypal_order_id)
          .catch((e) => {
            setError(e.message);
            throw e;
          }),
      onApprove: (data: { orderID: string }) => capture(data.orderID).catch((e) => setError(e.message)),
      onCancel: () => setError("Checkout cancelled. The item stays reserved for a few minutes."),
      onError: (err: unknown) => setError(err instanceof Error ? err.message : "PayPal error"),
    };
    function render() {
      if (cancelled || !window.paypal) return;
      clearTimeout(timer);
      setSdk("ready");
      for (const el of [desktopRef.current, mobileRef.current]) {
        if (!el || el.childElementCount > 0) continue;
        window.paypal.Buttons(opts).render(el).catch(() => setSdk("failed"));
      }
    }
    if (window.paypal) render();
    else {
      const existing = document.querySelector<HTMLScriptElement>("script[data-paypal-sdk]");
      if (existing) existing.addEventListener("load", render);
      else {
        const s = document.createElement("script");
        s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(props.paypalClientId)}&currency=USD&intent=capture&components=buttons`;
        s.async = true;
        s.dataset.paypalSdk = "1";
        s.onload = render;
        s.onerror = () => {
          clearTimeout(timer);
          setSdk("failed");
        };
        document.body.appendChild(s);
      }
    }
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [smartButtons, props.paypalClientId]);

  /** Redirect flow: works without the PayPal script and in mock mode. */
  async function payOnPayPal() {
    setBusy(true);
    setError(null);
    try {
      const d = await createOrder();
      if (!d.approval_url) throw new Error("PayPal did not return an approval link");
      window.location.href = d.approval_url;
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

  const paypalIcon = (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="3" />
      <path d="M2 10h20" />
    </svg>
  );

  function payControl(ref: React.RefObject<HTMLDivElement | null>) {
    if (!available) return null;
    if (props.paypalMode === "none") return <p className="text-sm text-danger">PayPal is not configured on this server.</p>;
    if (props.paypalMode === "mock") {
      return (
        <button className="btn-accent w-full" onClick={payOnPayPal} disabled={busy} type="button">
          {paypalIcon}
          {busy ? "Starting…" : `Simulate PayPal payment · ${formatUsd(total)}`}
        </button>
      );
    }
    return (
      <div className="flex flex-col gap-2">
        <div ref={ref} className={sdk === "failed" ? "hidden" : "min-h-12"} />
        {sdk === "loading" && <div className="text-center text-xs text-muted">Loading PayPal…</div>}
        {sdk === "failed" ? (
          <button className="btn-accent w-full" onClick={payOnPayPal} disabled={busy} type="button">
            {paypalIcon}
            {busy ? "Redirecting…" : `Pay ${formatUsd(total)} with PayPal`}
          </button>
        ) : (
          <button className="text-center text-xs text-muted underline" onClick={payOnPayPal} disabled={busy} type="button">
            {busy ? "Redirecting…" : "Button not showing? Pay on PayPal.com instead"}
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="card-raised flex flex-col gap-3.5 p-5">
        {!available && <div className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-ink-2">This item is {props.status.toLowerCase()}.</div>}
        {deliveryChoice}
        <div className="flex items-baseline justify-between border-t border-line pt-3.5">
          <span className="text-sm text-ink-2">Total</span>
          <span className="font-display text-[26px] font-extrabold">{formatUsd(total)}</span>
        </div>
        <div className="hidden md:block">{payControl(desktopRef)}</div>
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
          {payControl(mobileRef)}
        </div>
      )}
    </>
  );
}
