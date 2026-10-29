import { randomUUID } from "node:crypto";
import { centsToPayPalValue } from "@agentshelf/shared";
import type { PayPalApi } from "./client";
import type {
  CreateOrderInput,
  PayPalOrder,
  PayPalPaymentToken,
  PayPalPayoutBatch,
  PayPalRefund,
  PayPalSetupToken,
  PayPalWebhookEvent,
  WebhookHeaders,
} from "./types";

/**
 * In-memory PayPal stand-in for local development and automated tests when no
 * sandbox credentials are configured. It mirrors the response shapes the real
 * client returns so Commerce core runs the exact same code path.
 * Never enabled in production.
 */
export class MockPayPalClient implements PayPalApi {
  readonly mode = "mock" as const;
  readonly baseUrl = "mock://paypal";
  private orders = new Map<string, PayPalOrder & { _input: CreateOrderInput }>();
  private setupTokens = new Map<string, PayPalSetupToken>();
  private paymentTokens = new Map<string, PayPalPaymentToken>();
  private captures = new Map<string, { orderId: string; amountCents: number; refundedCents: number }>();
  private byRequestId = new Map<string, string>();

  constructor(private readonly appUrl: string) {}

  async createOrder(input: CreateOrderInput): Promise<PayPalOrder> {
    const existing = this.byRequestId.get(input.requestId);
    if (existing) return this.orders.get(existing)!;
    const id = `MOCK-${randomUUID().slice(0, 8).toUpperCase()}`;
    const total = input.itemCents + input.shippingCents;
    const base: PayPalOrder & { _input: CreateOrderInput } = {
      id,
      status: "PAYER_ACTION_REQUIRED",
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: input.referenceId,
          custom_id: input.customId,
          description: input.description,
          payee: { email_address: input.payeeEmail },
          amount: {
            currency_code: "USD",
            value: centsToPayPalValue(total),
            breakdown: {
              item_total: { currency_code: "USD", value: centsToPayPalValue(input.itemCents) },
              shipping: { currency_code: "USD", value: centsToPayPalValue(input.shippingCents) },
            },
          },
        },
      ],
      links: [{ rel: "payer-action", href: `${this.appUrl}/mock-paypal/approve?token=${id}`, method: "GET" }],
      _input: input,
    };
    this.orders.set(id, base);
    this.byRequestId.set(input.requestId, id);
    if (input.vaultId) {
      let token = this.paymentTokens.get(input.vaultId);
      if (!token && input.vaultId.startsWith("MOCK-PT-")) {
        // Token minted by another process (e.g. the seed script): accept it, the mock is stateless across restarts.
        token = { id: input.vaultId, payment_source: { paypal: { email_address: "sb-agentbuyer@personal.example.com", usage_type: "MERCHANT" } } };
        this.paymentTokens.set(input.vaultId, token);
      }
      if (!token) {
        const { PayPalApiError } = await import("./types");
        throw new PayPalApiError("PayPal POST /v2/checkout/orders -> 422 UNPROCESSABLE_ENTITY", 422, {
          name: "UNPROCESSABLE_ENTITY",
          details: [{ issue: "INVALID_RESOURCE_ID", description: "Specified resource ID does not exist." }],
        });
      }
      return this.complete(id, token.payment_source?.paypal?.email_address ?? "buyer@example.com");
    }
    return base;
  }

  /** Called by the mock approval page: simulates the buyer approving in PayPal. */
  async approveOrder(id: string, payerEmail = "sb-buyer@personal.example.com"): Promise<PayPalOrder> {
    const o = this.orders.get(id);
    if (!o) throw new Error("mock order not found");
    if (o.status === "PAYER_ACTION_REQUIRED" || o.status === "CREATED") {
      o.status = "APPROVED";
      o.payer = { email_address: payerEmail, payer_id: "MOCKPAYER", name: { given_name: "Sandbox", surname: "Buyer" } };
      if (o._input.needsShippingAddress) {
        o.purchase_units![0]!.shipping = {
          name: { full_name: "Sandbox Buyer" },
          address: { address_line_1: "1 Main St", admin_area_2: "San Jose", admin_area_1: "CA", postal_code: "95131", country_code: "US" },
        };
      }
    }
    return o;
  }

  private complete(id: string, payerEmail: string): PayPalOrder {
    const o = this.orders.get(id)!;
    const captureId = `CAP-${randomUUID().slice(0, 10).toUpperCase()}`;
    const total = o._input.itemCents + o._input.shippingCents;
    o.status = "COMPLETED";
    o.payer = o.payer ?? { email_address: payerEmail, payer_id: "MOCKPAYER", name: { given_name: "Sandbox", surname: "Buyer" } };
    o.purchase_units![0]!.payments = {
      captures: [{ id: captureId, status: "COMPLETED", amount: { currency_code: "USD", value: centsToPayPalValue(total) }, custom_id: o._input.customId }],
    };
    this.captures.set(captureId, { orderId: id, amountCents: total, refundedCents: 0 });
    return o;
  }

  async getOrder(orderId: string): Promise<PayPalOrder> {
    const o = this.orders.get(orderId);
    if (!o) throw new Error("mock order not found");
    return o;
  }

  async captureOrder(orderId: string, _requestId: string): Promise<PayPalOrder> {
    const o = this.orders.get(orderId);
    if (!o) throw new Error("mock order not found");
    if (o.status === "COMPLETED") return o;
    if (o.status !== "APPROVED") {
      const { PayPalApiError } = await import("./types");
      throw new PayPalApiError("PayPal POST capture -> 422 ORDER_NOT_APPROVED", 422, {
        name: "UNPROCESSABLE_ENTITY",
        details: [{ issue: "ORDER_NOT_APPROVED", description: "Payer has not yet approved the Order for payment." }],
      });
    }
    return this.complete(orderId, o.payer?.email_address ?? "buyer@example.com");
  }

  async createSetupToken(input: { requestId: string; returnUrl: string; cancelUrl: string; customerId?: string }): Promise<PayPalSetupToken> {
    const id = `MOCK-ST-${randomUUID().slice(0, 8).toUpperCase()}`;
    const token: PayPalSetupToken = {
      id,
      status: "PAYER_ACTION_REQUIRED",
      customer: { id: input.customerId ?? `MOCKCUST${randomUUID().slice(0, 6)}` },
      links: [{ rel: "approve", href: `${this.appUrl}/mock-paypal/approve-wallet?approval_token_id=${id}&return=${encodeURIComponent(input.returnUrl)}` }],
    };
    this.setupTokens.set(id, token);
    return token;
  }

  async getSetupToken(id: string): Promise<PayPalSetupToken> {
    const t = this.setupTokens.get(id);
    if (!t) throw new Error("mock setup token not found");
    return t;
  }

  async approveSetupToken(id: string): Promise<void> {
    const t = this.setupTokens.get(id);
    if (t) t.status = "APPROVED";
  }

  async createPaymentToken(input: { requestId: string; setupTokenId: string }): Promise<PayPalPaymentToken> {
    const st = this.setupTokens.get(input.setupTokenId);
    if (!st) throw new Error("mock setup token not found");
    const id = `MOCK-PT-${randomUUID().slice(0, 8).toUpperCase()}`;
    const token: PayPalPaymentToken = {
      id,
      customer: st.customer,
      payment_source: { paypal: { email_address: "sb-agentbuyer@personal.example.com", payer_id: "MOCKPAYER2", usage_type: "MERCHANT" } },
    };
    this.paymentTokens.set(id, token);
    return token;
  }

  async getPaymentToken(id: string): Promise<PayPalPaymentToken> {
    const t = this.paymentTokens.get(id);
    if (!t) throw new Error("mock payment token not found");
    return t;
  }

  async deletePaymentToken(id: string): Promise<void> {
    this.paymentTokens.delete(id);
  }

  async refundCapture(input: { captureId: string; requestId: string; amountCents?: number; note?: string }): Promise<PayPalRefund> {
    const c = this.captures.get(input.captureId);
    if (!c) throw new Error("mock capture not found");
    const amount = input.amountCents ?? c.amountCents - c.refundedCents;
    c.refundedCents += amount;
    return { id: `REF-${randomUUID().slice(0, 10).toUpperCase()}`, status: "COMPLETED", amount: { currency_code: "USD", value: centsToPayPalValue(amount) } };
  }

  async addTracking(input: { orderId: string; captureId: string; trackingNumber: string; carrier: string; notifyPayer?: boolean }): Promise<PayPalOrder> {
    return this.getOrder(input.orderId);
  }

  private payouts = new Map<string, PayPalPayoutBatch>();
  async createPayout(input: { requestId: string; senderBatchId: string; senderItemId: string; receiverEmail: string; amountCents: number; note?: string }): Promise<PayPalPayoutBatch> {
    const existing = [...this.payouts.values()].find((b) => b.batch_header.sender_batch_header?.sender_batch_id === input.senderBatchId);
    if (existing) return existing;
    const id = `MOCK-PB-${randomUUID().slice(0, 8).toUpperCase()}`;
    const batch: PayPalPayoutBatch = {
      batch_header: { payout_batch_id: id, batch_status: "PENDING", sender_batch_header: { sender_batch_id: input.senderBatchId } },
      items: [{ payout_item_id: `MOCK-PI-${randomUUID().slice(0, 6)}`, transaction_status: "PENDING", payout_item: { sender_item_id: input.senderItemId, receiver: input.receiverEmail } }],
    };
    this.payouts.set(id, batch);
    return batch;
  }
  async getPayout(batchId: string): Promise<PayPalPayoutBatch> {
    const b = this.payouts.get(batchId);
    if (!b) throw new Error("mock payout not found");
    b.batch_header.batch_status = "SUCCESS";
    for (const i of b.items ?? []) i.transaction_status = "SUCCESS";
    return b;
  }

  async verifyWebhookSignature(_headers: WebhookHeaders, _event: PayPalWebhookEvent): Promise<boolean> {
    return _headers.transmissionSig === "mock-signature";
  }
}
