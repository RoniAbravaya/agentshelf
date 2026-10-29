/** Money helpers. All amounts are integer US cents. */

export const CURRENCY = "USD" as const;

export function assertCents(cents: number, label = "amount"): number {
  if (!Number.isInteger(cents) || cents < 0) {
    throw new Error(`${label} must be a non-negative integer number of cents, got ${cents}`);
  }
  return cents;
}

/** 8400 -> "84.00" (the string format PayPal expects in amount.value). */
export function centsToPayPalValue(cents: number): string {
  assertCents(cents);
  const dollars = Math.floor(cents / 100);
  const rem = cents % 100;
  return `${dollars}.${rem.toString().padStart(2, "0")}`;
}

/** "84.00" -> 8400. Accepts "84", "84.5", "$84.50", "1,084.50". */
export function parseUsdToCents(input: string | number): number {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) throw new Error(`invalid amount ${input}`);
    return Math.round(input * 100);
  }
  const cleaned = input.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) throw new Error(`invalid USD amount "${input}"`);
  const [whole, frac = ""] = cleaned.split(".");
  return Number(whole) * 100 + Number((frac + "00").slice(0, 2));
}

/** 8400 -> "$84.00" */
export function formatUsd(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString("en-US");
  const rem = (abs % 100).toString().padStart(2, "0");
  return `${sign}$${dollars}.${rem}`;
}

/** 8400 -> 84 (number of dollars, fractional). For AI-facing payloads. */
export function centsToUsdNumber(cents: number): number {
  return Math.round(cents) / 100;
}
