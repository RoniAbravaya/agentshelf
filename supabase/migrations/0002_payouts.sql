-- Seller settlement for agent orders collected by the platform account (PayPal Payouts).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paypal_payout_batch_id text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payout_status text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payout_cents integer;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payout_error text;
