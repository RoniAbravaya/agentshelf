-- AgentShelf initial schema. Applies to Supabase Postgres and to embedded PGlite.
-- Money is integer cents; timestamps are UTC; PayPal ids are text.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS users (
  id            text PRIMARY KEY,
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  display_name  text NOT NULL,
  role          text NOT NULL DEFAULT 'both',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sellers (
  user_id                     text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name                text NOT NULL,
  paypal_payee_email          text NOT NULL,
  payouts_mode                text NOT NULL DEFAULT 'direct',
  rating_avg                  real,
  review_count                integer NOT NULL DEFAULT 0,
  items_sold                  integer NOT NULL DEFAULT 0,
  member_since                timestamptz NOT NULL DEFAULT now(),
  median_reply_minutes        integer,
  contact_phone_enc           text,
  share_contact_after_purchase boolean NOT NULL DEFAULT false,
  bio                         text
);

CREATE TABLE IF NOT EXISTS listings (
  id                 text PRIMARY KEY,
  seller_id          text NOT NULL REFERENCES sellers(user_id) ON DELETE CASCADE,
  status             text NOT NULL DEFAULT 'DRAFT',
  title              text NOT NULL DEFAULT '',
  description        text NOT NULL DEFAULT '',
  category           text NOT NULL DEFAULT 'other',
  condition          text NOT NULL DEFAULT 'GOOD',
  brand              text,
  attributes         jsonb NOT NULL DEFAULT '{}'::jsonb,
  tags               jsonb NOT NULL DEFAULT '[]'::jsonb,
  price_cents        integer NOT NULL DEFAULT 0,
  currency           text NOT NULL DEFAULT 'USD',
  photos             jsonb NOT NULL DEFAULT '[]'::jsonb,
  area_label         text NOT NULL DEFAULT '',
  zip                text,
  geo_lat            real,
  geo_lng            real,
  pickup_enabled     boolean NOT NULL DEFAULT true,
  shipping_enabled   boolean NOT NULL DEFAULT false,
  shipping_cents     integer,
  handling_days      integer,
  pickup_address_enc text,
  embedding          vector(512),
  ai_draft           jsonb,
  ai_provider        text,
  seller_note        text,
  published_at       timestamptz,
  sold_at            timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  search_tsv         tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(brand, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(category, '')), 'C')
  ) STORED
);
CREATE INDEX IF NOT EXISTS listings_status_idx ON listings(status);
CREATE INDEX IF NOT EXISTS listings_seller_idx ON listings(seller_id);
CREATE INDEX IF NOT EXISTS listings_category_idx ON listings(category);
CREATE INDEX IF NOT EXISTS listings_search_tsv_idx ON listings USING GIN (search_tsv);

CREATE TABLE IF NOT EXISTS reservations (
  listing_id text PRIMARY KEY REFERENCES listings(id) ON DELETE CASCADE,
  order_id   text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS buyer_wallets (
  buyer_id            text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  paypal_customer_id  text,
  payment_token_enc   text,
  payment_token_hint  text,
  payer_email         text,
  setup_token_id      text,
  status              text NOT NULL DEFAULT 'PENDING',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS spend_policies (
  id                       text PRIMARY KEY,
  buyer_id                 text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version                  integer NOT NULL,
  max_per_order_cents      integer NOT NULL,
  monthly_cap_cents        integer NOT NULL,
  auto_approve_below_cents integer,
  allowed_categories       jsonb NOT NULL DEFAULT '[]'::jsonb,
  blocked_keywords         jsonb NOT NULL DEFAULT '[]'::jsonb,
  home_geo                 jsonb,
  max_pickup_km            real,
  max_shipping_cents       integer,
  allow_pickup             boolean NOT NULL DEFAULT true,
  allow_shipping           boolean NOT NULL DEFAULT true,
  min_seller_rating        real,
  source_text              text NOT NULL DEFAULT '',
  created_at               timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS spend_policies_buyer_version_idx ON spend_policies(buyer_id, version);

CREATE TABLE IF NOT EXISTS agent_keys (
  id           text PRIMARY KEY,
  buyer_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_hash     text NOT NULL UNIQUE,
  key_prefix   text NOT NULL,
  label        text NOT NULL DEFAULT 'Claude Desktop',
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);
CREATE INDEX IF NOT EXISTS agent_keys_buyer_idx ON agent_keys(buyer_id);

CREATE TABLE IF NOT EXISTS quotes (
  id             text PRIMARY KEY,
  buyer_id       text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id     text NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  fulfillment    text NOT NULL,
  item_cents     integer NOT NULL,
  shipping_cents integer NOT NULL DEFAULT 0,
  total_cents    integer NOT NULL,
  policy_result  text NOT NULL,
  policy_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  policy_version integer,
  expires_at     timestamptz NOT NULL,
  used_at        timestamptz,
  order_id       text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS quotes_buyer_idx ON quotes(buyer_id);

CREATE TABLE IF NOT EXISTS orders (
  id               text PRIMARY KEY,
  listing_id       text NOT NULL REFERENCES listings(id),
  seller_id        text NOT NULL REFERENCES sellers(user_id),
  buyer_id         text REFERENCES users(id),
  channel          text NOT NULL,
  fulfillment      text NOT NULL,
  status           text NOT NULL,
  item_cents       integer NOT NULL,
  shipping_cents   integer NOT NULL DEFAULT 0,
  total_cents      integer NOT NULL,
  currency         text NOT NULL DEFAULT 'USD',
  shipping_address jsonb,
  buyer_name       text,
  buyer_email      text,
  tracking_number  text,
  carrier          text,
  collected_at     timestamptz,
  paypal_order_id  text UNIQUE,
  paypal_capture_id text,
  paypal_refund_id text,
  request_id       text NOT NULL UNIQUE,
  approval_url     text,
  quote_id         text,
  policy_result    text,
  listing_snapshot jsonb,
  failure_reason   text,
  paid_at          timestamptz,
  refunded_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_buyer_idx ON orders(buyer_id);
CREATE INDEX IF NOT EXISTS orders_seller_idx ON orders(seller_id);
CREATE INDEX IF NOT EXISTS orders_listing_idx ON orders(listing_id);

CREATE TABLE IF NOT EXISTS conversations (
  id              text PRIMARY KEY,
  listing_id      text NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  buyer_id        text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_id       text NOT NULL REFERENCES sellers(user_id) ON DELETE CASCADE,
  order_id        text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS conversations_listing_buyer_idx ON conversations(listing_id, buyer_id);

CREATE TABLE IF NOT EXISTS messages (
  id              text PRIMARY KEY,
  conversation_id text NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender          text NOT NULL,
  body            text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  read_at         timestamptz
);
CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages(conversation_id);

CREATE TABLE IF NOT EXISTS reviews (
  id         text PRIMARY KEY,
  order_id   text NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  seller_id  text NOT NULL REFERENCES sellers(user_id) ON DELETE CASCADE,
  buyer_id   text REFERENCES users(id),
  stars      integer NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment    text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS webhook_events (
  id            text PRIMARY KEY,
  event_type    text NOT NULL,
  resource_type text,
  payload       jsonb NOT NULL,
  verified      boolean NOT NULL DEFAULT false,
  processed_at  timestamptz,
  error         text,
  received_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_events (
  id         serial PRIMARY KEY,
  actor      text NOT NULL,
  actor_id   text,
  action     text NOT NULL,
  entity     text NOT NULL,
  entity_id  text,
  details    jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
