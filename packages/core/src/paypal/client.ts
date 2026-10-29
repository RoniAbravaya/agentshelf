import { centsToPayPalValue } from "@agentshelf/shared";
import { getEnv } from "../env";
import {
  PayPalApiError,
  type CreateOrderInput,
  type PayPalOrder,
  type PayPalPaymentToken,
  type PayPalPayoutBatch,
  type PayPalRefund,
  type PayPalSetupToken,
  type PayPalWebhookEvent,
  type WebhookHeaders,
} from "./types";

/**
 * Thin PayPal REST client (fetch-based). The client id/secret live only here, in
 * Commerce core. No LLM-facing code imports this module.
 */
export interface PayPalClientOptions {
  clientId: string;
  clientSecret: string;
  env: "sandbox" | "live";
  webhookId?: string;
  fetchImpl?: typeof fetch;
}

/** The surface Commerce core depends on; implemented by the real client and the dev mock. */
export interface PayPalApi {
  readonly mode: "sandbox" | "live" | "mock";
  readonly baseUrl: string;
  createOrder(input: CreateOrderInput): Promise<PayPalOrder>;
  getOrder(orderId: string): Promise<PayPalOrder>;
  captureOrder(orderId: string, requestId: string): Promise<PayPalOrder>;
  createSetupToken(input: { requestId: string; returnUrl: string; cancelUrl: string; customerId?: string }): Promise<PayPalSetupToken>;
  getSetupToken(id: string): Promise<PayPalSetupToken>;
  createPaymentToken(input: { requestId: string; setupTokenId: string }): Promise<PayPalPaymentToken>;
  getPaymentToken(id: string): Promise<PayPalPaymentToken>;
  deletePaymentToken(id: string): Promise<void>;
  refundCapture(input: { captureId: string; requestId: string; amountCents?: number; note?: string }): Promise<PayPalRefund>;
  addTracking(input: { orderId: string; captureId: string; trackingNumber: string; carrier: string; notifyPayer?: boolean }): Promise<PayPalOrder>;
  verifyWebhookSignature(headers: WebhookHeaders, event: PayPalWebhookEvent): Promise<boolean>;
  createPayout(input: { requestId: string; senderBatchId: string; senderItemId: string; receiverEmail: string; amountCents: number; note?: string }): Promise<PayPalPayoutBatch>;
  getPayout(batchId: string): Promise<PayPalPayoutBatch>;
}

export class PayPalClient implements PayPalApi {
  private token: { value: string; expiresAt: number } | null = null;
  readonly baseUrl: string;
  readonly mode: "sandbox" | "live";
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: PayPalClientOptions) {
    this.mode = opts.env;
    this.baseUrl = opts.env === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  static fromEnv(): PayPalClient | null {
    const env = getEnv();
    if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) return null;
    return new PayPalClient({
      clientId: env.PAYPAL_CLIENT_ID,
      clientSecret: env.PAYPAL_CLIENT_SECRET,
      env: env.PAYPAL_ENV,
      webhookId: env.PAYPAL_WEBHOOK_ID,
    });
  }

  async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const basic = Buffer.from(`${this.opts.clientId}:${this.opts.clientSecret}`).toString("base64");
    const res = await this.fetchImpl(`${this.baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
    });
    const body = (await res.json()) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
    if (!res.ok || !body.access_token) {
      throw new PayPalApiError(`PayPal auth failed: ${body.error_description ?? body.error ?? res.status}`, res.status, body);
    }
    this.token = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
    return this.token.value;
  }

  async request<T>(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    body?: unknown,
    extraHeaders: Record<string, string> = {},
  ): Promise<{ status: number; data: T }> {
    const token = await this.accessToken();
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...extraHeaders,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }
    }
    if (!res.ok) {
      const d = data as { message?: string; name?: string; debug_id?: string } | null;
      throw new PayPalApiError(
        `PayPal ${method} ${path} -> ${res.status} ${d?.name ?? ""} ${d?.message ?? ""}`.trim(),
        res.status,
        data,
        d?.debug_id ?? res.headers.get("paypal-debug-id") ?? undefined,
      );
    }
    return { status: res.status, data: data as T };
  }

  // ---- Orders v2 -----------------------------------------------------------

  /**
   * Create an order with the seller as payee. For agent purchases pass vaultId:
   * the buyer's saved PayPal wallet pays without a redirect. Returns the order as
   * PayPal reports it; the caller inspects status (COMPLETED / APPROVED /
   * PAYER_ACTION_REQUIRED) and the links.
   */
  async createOrder(input: CreateOrderInput): Promise<PayPalOrder> {
    const total = input.itemCents + input.shippingCents;
    const amount = {
      currency_code: "USD",
      value: centsToPayPalValue(total),
      breakdown: {
        item_total: { currency_code: "USD", value: centsToPayPalValue(input.itemCents) },
        shipping: { currency_code: "USD", value: centsToPayPalValue(input.shippingCents) },
      },
    };
    const experience_context: Record<string, unknown> = {
      shipping_preference: input.needsShippingAddress ? "GET_FROM_FILE" : "NO_SHIPPING",
      user_action: "PAY_NOW",
      brand_name: input.brandName ?? "AgentShelf",
      ...(input.returnUrl ? { return_url: input.returnUrl } : {}),
      ...(input.cancelUrl ? { cancel_url: input.cancelUrl } : {}),
    };
    const paypalSource: Record<string, unknown> = input.vaultId
      ? { vault_id: input.vaultId }
      : { experience_context };
    const body = {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: input.referenceId,
          custom_id: input.customId,
          description: input.description.slice(0, 127),
          // No payee -> the platform (API caller) account receives the funds.
          ...(input.payeeEmail ? { payee: { email_address: input.payeeEmail } } : {}),
          amount,
        },
      ],
      payment_source: { paypal: paypalSource },
    };
    const { data } = await this.request<PayPalOrder>("POST", "/v2/checkout/orders", body, {
      "PayPal-Request-Id": input.requestId,
      Prefer: "return=representation",
    });
    return data;
  }

  async getOrder(orderId: string): Promise<PayPalOrder> {
    const { data } = await this.request<PayPalOrder>("GET", `/v2/checkout/orders/${encodeURIComponent(orderId)}`);
    return data;
  }

  async captureOrder(orderId: string, requestId: string): Promise<PayPalOrder> {
    const { data } = await this.request<PayPalOrder>(
      "POST",
      `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
      {},
      { "PayPal-Request-Id": requestId, Prefer: "return=representation" },
    );
    return data;
  }

  // ---- Vault v3 (save PayPal wallet without purchase) -----------------------

  async createSetupToken(input: { requestId: string; returnUrl: string; cancelUrl: string; customerId?: string }): Promise<PayPalSetupToken> {
    const body = {
      ...(input.customerId ? { customer: { id: input.customerId } } : {}),
      payment_source: {
        paypal: {
          usage_type: "MERCHANT",
          experience_context: {
            brand_name: "AgentShelf",
            return_url: input.returnUrl,
            cancel_url: input.cancelUrl,
          },
        },
      },
    };
    const { data } = await this.request<PayPalSetupToken>("POST", "/v3/vault/setup-tokens", body, {
      "PayPal-Request-Id": input.requestId,
    });
    return data;
  }

  async getSetupToken(id: string): Promise<PayPalSetupToken> {
    const { data } = await this.request<PayPalSetupToken>("GET", `/v3/vault/setup-tokens/${encodeURIComponent(id)}`);
    return data;
  }

  async createPaymentToken(input: { requestId: string; setupTokenId: string }): Promise<PayPalPaymentToken> {
    const body = { payment_source: { token: { id: input.setupTokenId, type: "SETUP_TOKEN" } } };
    const { data } = await this.request<PayPalPaymentToken>("POST", "/v3/vault/payment-tokens", body, {
      "PayPal-Request-Id": input.requestId,
    });
    return data;
  }

  async getPaymentToken(id: string): Promise<PayPalPaymentToken> {
    const { data } = await this.request<PayPalPaymentToken>("GET", `/v3/vault/payment-tokens/${encodeURIComponent(id)}`);
    return data;
  }

  async deletePaymentToken(id: string): Promise<void> {
    await this.request<unknown>("DELETE", `/v3/vault/payment-tokens/${encodeURIComponent(id)}`);
  }

  // ---- Payments: refunds ---------------------------------------------------

  async refundCapture(input: { captureId: string; requestId: string; amountCents?: number; note?: string }): Promise<PayPalRefund> {
    const body: Record<string, unknown> = {};
    if (input.amountCents != null) body.amount = { currency_code: "USD", value: centsToPayPalValue(input.amountCents) };
    if (input.note) body.note_to_payer = input.note.slice(0, 255);
    const { data } = await this.request<PayPalRefund>(
      "POST",
      `/v2/payments/captures/${encodeURIComponent(input.captureId)}/refund`,
      body,
      { "PayPal-Request-Id": input.requestId, Prefer: "return=representation" },
    );
    return data;
  }

  // ---- Shipment tracking ---------------------------------------------------

  async addTracking(input: { orderId: string; captureId: string; trackingNumber: string; carrier: string; notifyPayer?: boolean }): Promise<PayPalOrder> {
    const body = {
      capture_id: input.captureId,
      tracking_number: input.trackingNumber,
      carrier: normalizeCarrier(input.carrier),
      notify_payer: input.notifyPayer ?? true,
    };
    const { data } = await this.request<PayPalOrder>("POST", `/v2/checkout/orders/${encodeURIComponent(input.orderId)}/track`, body);
    return data;
  }

  // ---- Payouts (platform account -> seller) ---------------------------------

  async createPayout(input: { requestId: string; senderBatchId: string; senderItemId: string; receiverEmail: string; amountCents: number; note?: string }): Promise<PayPalPayoutBatch> {
    const body = {
      sender_batch_header: {
        sender_batch_id: input.senderBatchId,
        email_subject: "You have a payout from AgentShelf",
        email_message: (input.note ?? "Payment for your AgentShelf sale").slice(0, 1000),
      },
      items: [
        {
          recipient_type: "EMAIL",
          amount: { value: centsToPayPalValue(input.amountCents), currency: "USD" },
          receiver: input.receiverEmail,
          note: (input.note ?? "AgentShelf sale").slice(0, 4000),
          sender_item_id: input.senderItemId,
        },
      ],
    };
    const { data } = await this.request<PayPalPayoutBatch>("POST", "/v1/payments/payouts", body, { "PayPal-Request-Id": input.requestId });
    return data;
  }

  async getPayout(batchId: string): Promise<PayPalPayoutBatch> {
    const { data } = await this.request<PayPalPayoutBatch>("GET", `/v1/payments/payouts/${encodeURIComponent(batchId)}`);
    return data;
  }

  // ---- Webhooks ------------------------------------------------------------

  async verifyWebhookSignature(headers: WebhookHeaders, event: PayPalWebhookEvent): Promise<boolean> {
    const webhookId = this.opts.webhookId;
    if (!webhookId) throw new Error("PAYPAL_WEBHOOK_ID is not configured");
    const body = {
      auth_algo: headers.authAlgo,
      cert_url: headers.certUrl,
      transmission_id: headers.transmissionId,
      transmission_sig: headers.transmissionSig,
      transmission_time: headers.transmissionTime,
      webhook_id: webhookId,
      webhook_event: event,
    };
    const { data } = await this.request<{ verification_status: "SUCCESS" | "FAILURE" }>(
      "POST",
      "/v1/notifications/verify-webhook-signature",
      body,
    );
    return data.verification_status === "SUCCESS";
  }
}

const CARRIERS = ["USPS", "UPS", "FEDEX", "DHL", "DHL_GLOBAL_MAIL", "ONTRAC", "LASERSHIP", "AMAZON", "OTHER"];
export function normalizeCarrier(input: string): string {
  const up = input.trim().toUpperCase().replace(/[^A-Z_]/g, "");
  if (up === "FED_EX" || up === "FEDEXUS") return "FEDEX";
  if (up === "DHLEXPRESS") return "DHL";
  return CARRIERS.includes(up) ? up : "OTHER";
}

/** Helpers to read an order response. */
export function orderApprovalLink(order: PayPalOrder): string | null {
  const link = order.links?.find((l) => l.rel === "payer-action") ?? order.links?.find((l) => l.rel === "approve");
  return link?.href ?? null;
}

export function orderCaptureId(order: PayPalOrder): string | null {
  const cap = order.purchase_units?.[0]?.payments?.captures?.find((c) => c.status === "COMPLETED" || c.status === "PENDING");
  return cap?.id ?? order.purchase_units?.[0]?.payments?.captures?.[0]?.id ?? null;
}

export function orderShippingAddress(order: PayPalOrder): Record<string, unknown> | null {
  const s = order.purchase_units?.[0]?.shipping;
  if (!s?.address) return null;
  return { name: s.name?.full_name ?? null, ...s.address };
}

export function orderPayer(order: PayPalOrder): { name: string | null; email: string | null } {
  const p = order.payer ?? {};
  const src = order.payment_source?.paypal ?? {};
  const name = [p.name?.given_name ?? src.name?.given_name, p.name?.surname ?? src.name?.surname].filter(Boolean).join(" ");
  return { name: name || null, email: p.email_address ?? src.email_address ?? null };
}

let singleton: PayPalApi | null | undefined;

/**
 * Real sandbox client when credentials exist; otherwise, outside production, an
 * in-memory mock so the whole flow can be exercised locally. Null in production
 * without credentials.
 */
export function getPayPal(): PayPalApi | null {
  if (singleton === undefined) {
    const env = getEnv();
    const real = PayPalClient.fromEnv();
    if (real) singleton = real;
    else if (env.NODE_ENV !== "production" && env.PAYPAL_MOCK !== "false") {
      singleton = new MockPayPalClient(env.APP_URL.replace(/\/$/, ""));
    } else singleton = null;
  }
  return singleton;
}

export function requirePayPal(): PayPalApi {
  const p = getPayPal();
  if (!p) throw new Error("PayPal is not configured (set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET)");
  return p;
}

/** Test hook. */
export function setPayPalForTests(client: PayPalApi | null | undefined): void {
  singleton = client;
}

import { MockPayPalClient } from "./mock";
