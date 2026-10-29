/** Minimal PayPal REST types used by AgentShelf (sandbox). */

export interface PayPalMoney {
  currency_code: string;
  value: string;
}

export interface PayPalLink {
  href: string;
  rel: string;
  method?: string;
}

export interface PayPalCapture {
  id: string;
  status: "COMPLETED" | "DECLINED" | "PARTIALLY_REFUNDED" | "PENDING" | "REFUNDED" | "FAILED";
  amount?: PayPalMoney;
  custom_id?: string;
  invoice_id?: string;
  seller_receivable_breakdown?: unknown;
  create_time?: string;
  update_time?: string;
}

export interface PayPalPurchaseUnit {
  reference_id?: string;
  custom_id?: string;
  description?: string;
  amount?: PayPalMoney & {
    breakdown?: { item_total?: PayPalMoney; shipping?: PayPalMoney };
  };
  payee?: { email_address?: string; merchant_id?: string };
  shipping?: {
    name?: { full_name?: string };
    address?: {
      address_line_1?: string;
      address_line_2?: string;
      admin_area_2?: string;
      admin_area_1?: string;
      postal_code?: string;
      country_code?: string;
    };
  };
  payments?: { captures?: PayPalCapture[]; refunds?: Array<{ id: string; status: string }> };
}

export type PayPalOrderStatus =
  | "CREATED"
  | "SAVED"
  | "APPROVED"
  | "VOIDED"
  | "COMPLETED"
  | "PAYER_ACTION_REQUIRED";

export interface PayPalOrder {
  id: string;
  status: PayPalOrderStatus;
  intent?: "CAPTURE" | "AUTHORIZE";
  purchase_units?: PayPalPurchaseUnit[];
  payer?: {
    email_address?: string;
    payer_id?: string;
    name?: { given_name?: string; surname?: string };
  };
  payment_source?: { paypal?: { email_address?: string; account_id?: string; name?: { given_name?: string; surname?: string } } };
  links?: PayPalLink[];
  create_time?: string;
  update_time?: string;
}

export interface CreateOrderInput {
  requestId: string;
  referenceId: string;
  customId: string;
  description: string;
  payeeEmail: string;
  itemCents: number;
  shippingCents: number;
  /** true -> PayPal collects a shipping address; false -> NO_SHIPPING (pickup) */
  needsShippingAddress: boolean;
  /** Vaulted PayPal payment token id (agent flow). */
  vaultId?: string;
  returnUrl?: string;
  cancelUrl?: string;
  brandName?: string;
}

export interface PayPalSetupToken {
  id: string;
  status: string;
  customer?: { id?: string };
  links?: PayPalLink[];
  payment_source?: unknown;
}

export interface PayPalPaymentToken {
  id: string;
  status?: string;
  customer?: { id?: string };
  payment_source?: {
    paypal?: {
      email_address?: string;
      payer_id?: string;
      name?: { given_name?: string; surname?: string };
      usage_type?: string;
    };
  };
  links?: PayPalLink[];
}

export interface PayPalRefund {
  id: string;
  status: "CANCELLED" | "FAILED" | "PENDING" | "COMPLETED";
  amount?: PayPalMoney;
  links?: PayPalLink[];
}

export interface PayPalWebhookEvent {
  id: string;
  event_type: string;
  resource_type?: string;
  resource_version?: string;
  summary?: string;
  create_time?: string;
  resource?: Record<string, unknown>;
}

export interface WebhookHeaders {
  transmissionId: string;
  transmissionTime: string;
  transmissionSig: string;
  certUrl: string;
  authAlgo: string;
}

export class PayPalApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
    public readonly debugId?: string,
  ) {
    super(message);
    this.name = "PayPalApiError";
  }
  /** PayPal "name" field, e.g. UNPROCESSABLE_ENTITY */
  get code(): string | undefined {
    const b = this.body as { name?: string } | undefined;
    return b?.name;
  }
  get issues(): Array<{ issue?: string; description?: string; field?: string }> {
    const b = this.body as { details?: Array<{ issue?: string; description?: string; field?: string }> } | undefined;
    return b?.details ?? [];
  }
}
