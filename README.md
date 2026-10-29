# AgentShelf

**Sell anything to people and AI agents, paid through PayPal.**

An individual snaps a photo of something to sell. AI turns it into a listing with a PayPal checkout that works for human buyers, and the same item is exposed to AI shopping agents through an MCP server. A buyer's agent can find it, check it against the buyer's own spending rules, and pay for it with the buyer's saved PayPal wallet.

Built for the PayPal AI Hackathon 2026. **Sandbox only.**

## What it does

| Side | Flow |
| --- | --- |
| **Seller** | Sign up with the PayPal email that should receive payments → upload 1-4 photos → Claude vision (or the OpenAI vision API) drafts title, description, category, condition, specs, tags, a price range and a shipping estimate → edit, set price, pickup area and delivery → publish. |
| **Human buyer** | Browse/search → listing page with PayPal Smart Buttons → pay item + shipping → seller is the payee (merchant of record) → chat, tracking, pickup confirmation, rating. |
| **Agent buyer** | Write spending rules in plain English ("vintage cameras, max $120, $300 a month, ask me above $100, pickup within 10 km…") → AI parses them into a policy you confirm → save a PayPal wallet once (Vault v3) → create an MCP key → connect Claude Desktop (or the built-in demo agent). The agent calls `search_listings → quote_purchase → buy`; a deterministic **Spend Policy Engine** decides AUTO / NEEDS_APPROVAL / BLOCKED before PayPal is ever called. |

**The LLM can propose a purchase. Only deterministic code decides whether money moves.**

## Architecture

```
Seller (web)        Human buyer (web)        Buyer's AI agent (Claude Desktop / demo agent)
     │                     │                          │  MCP (Streamable HTTP, Bearer key)
     ▼                     ▼                          ▼
┌───────────────────────── apps/web (Next.js 16) ─────────────────────────┐
│ dashboard · storefront · API routes · PayPal webhook receiver · /mcp     │
│ demo agent (/agent): Claude tool-use loop → MCP client → /mcp           │
└──────────────┬──────────────────────────────────────────────────────────┘
               │ imports
┌──────────────▼────────── packages/core (Commerce core) ─────────────────┐
│ listings · search (FTS + pgvector, RRF) · reservations · orders         │
│ Spend Policy Engine (pure) · PayPal client (Orders v2, Vault v3,        │
│ Webhooks, Refunds, Tracking) · AI providers (Anthropic / OpenAI / stub) │
│ MCP tool definitions (10 tools)                                          │
└──────────────┬──────────────────────────────────────────────────────────┘
               │
     Postgres + pgvector (Supabase / Railway) — or embedded PGlite locally
```

- `apps/web` — Next.js App Router: storefront, seller dashboard, buyer settings, API routes, PayPal webhook, **remote MCP endpoint at `/mcp`**, demo agent.
- `apps/mcp` — optional standalone MCP server (Express) for a separate host; same tools, needs a shared Postgres.
- `packages/core` — Commerce core. Single owner of listings, reservations, orders, the PayPal client and the policy engine. No LLM ever sees PayPal credentials or vault tokens.
- `packages/shared` — zod schemas shared by the API, the MCP tools and the LLM structured outputs; money helpers (integer cents).
- `supabase/migrations` — SQL schema (also applied to PGlite).
- `scripts/e2e/sandbox.ts` — scripted end-to-end run of the test scenarios.

### Trust boundaries

- PayPal client id/secret live only in Commerce core environment variables.
- Vault payment tokens are stored **encrypted** server-side and mapped to the buyer; the agent only holds an opaque, **hashed** AgentShelf key.
- Seller text is untrusted input to buyer agents: MCP tools return structured fields, the description is labelled as seller-provided and instruction-like phrases are stripped.
- `buy()` only accepts a server-issued `quote_id`; every rule is re-checked inside a database transaction with the listing row locked, and the reservation is committed before PayPal is called.
- Every money-moving PayPal call carries a persisted `PayPal-Request-Id`; unique constraints on PayPal order id, request id and webhook event id make retries and duplicate webhooks safe.

## Quick start (zero setup)

Requires Node 20+ and pnpm (`npm i -g pnpm`). No database, Docker or API keys needed for a local demo: the app uses embedded PGlite, local photo storage, an in-memory PayPal stand-in and a placeholder listing generator until you add keys.

```bash
pnpm install
cp .env.example .env          # optional; defaults work
pnpm db:seed                  # demo sellers, 20 listings, an agent buyer with rules + key
pnpm dev:web                  # http://localhost:3000
```

Then:

1. Open http://localhost:3000 and browse. Sign in as `dan@agentshelf.demo` / `demo1234`.
2. **Settings → Agent wallet**: see Dan's parsed rules, saved (mock) wallet and MCP key.
3. **Demo agent** (`/agent`): paste the key from `.data/seed.json` (printed by the seed) and ask: *"Find me a Canon AE-1 film camera in good condition under $120"* → *"Buy it, I'll pick it up"*. Without `ANTHROPIC_API_KEY` the chat is off, but the **tool console** on the same page calls every MCP tool directly.
4. **Sell**: sign in as `maya@agentshelf.demo`, upload photos; with no AI key you get an editable placeholder draft.

> Embedded PGlite is single-process: stop the dev server before `pnpm db:seed`, or re-seed while it runs with
> `curl -X POST http://localhost:3000/api/dev/seed -H "Authorization: Bearer $INTERNAL_API_SECRET"`.

### Run the scripted end-to-end scenarios

With the app running (and seeded):

```bash
pnpm e2e:sandbox
```

It drives the real MCP endpoint and web API: search, prompt-injection defence, auto-approved agent purchase, approval-link purchase, blocked category/distance/shipping, duplicate and expired quotes, human checkout with reservation, idempotent capture, invalid webhook signature, refunds and ratings.

## Configuration

Copy `.env.example` to `.env` (one file at the repo root is shared by both apps).

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres with pgvector (Supabase or Railway). Empty → embedded PGlite under `./.data`. |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID` | Sandbox REST app (enable **Vault** under the app's advanced options). Empty → in-memory mock in dev. |
| `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | Same client id, for the JS SDK buttons. |
| `PAYPAL_AGENT_PAYEE_MODE` | `seller` (default: vaulted agent orders name the seller as payee) or `platform` (fallback if your sandbox rejects `vault_id` + a different payee). |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Claude vision listing generator, mandate parser and the demo agent (default `claude-opus-5-5`). |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | OpenAI vision listing generator (default `gpt-6-luna`; `gpt-6-astra` for best quality). |
| `LISTING_AI_PROVIDER` | `anthropic`, `openai` or `stub`. Default: first provider with a key. The seller can also pick per upload. |
| `EMBEDDINGS_PROVIDER` | `voyage` (`VOYAGE_API_KEY`) or `openai` for semantic search (512-dim pgvector); `none` → Postgres full-text only. |
| `STORAGE_PROVIDER` | `local` (served from `/uploads`) or `supabase` (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, bucket). |
| `SESSION_SECRET`, `DATA_ENCRYPTION_KEY`, `INTERNAL_API_SECRET` | Cookie signing, AES-256-GCM for private fields (pickup address, phone, vault token), cron/seed auth. |

### PayPal sandbox setup

1. Developer Dashboard → create a **US business** sandbox account that owns a REST app; copy client id/secret. In the app's advanced options enable **Vault**.
2. Create sandbox **personal** accounts with balance: Seller A, Seller B (payees), Buyer 1 (human), Buyer 2 (agent owner).
3. Create a webhook for `https://<your-host>/api/webhooks/paypal` with events `CHECKOUT.ORDER.APPROVED`, `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED`, `PAYMENT.CAPTURE.REFUNDED`, `PAYMENT.CAPTURE.REVERSED`, `VAULT.PAYMENT-TOKEN.CREATED`, `VAULT.PAYMENT-TOKEN.DELETED`; copy the webhook id. Locally, use ngrok and the dashboard's webhook simulator.
4. In AgentShelf, each seller enters their sandbox payee email in **Settings** (the seed uses `SEED_SELLER_A_EMAIL` etc. if set).
5. **Day-1 spike**: sign in as the agent buyer, save the wallet (Settings → Agent wallet → Connect PayPal), then buy something under $100 through the demo agent. If PayPal rejects a vaulted order whose payee differs from the platform account, AgentShelf automatically falls back to the one-tap approval link; set `PAYPAL_AGENT_PAYEE_MODE=platform` to route agent orders to the platform account instead.

### Connect Claude Desktop

Settings → Connectors → **Add custom connector**: URL `https://<your-host>/mcp`, request header `Authorization: Bearer <your AgentShelf key>` (from Settings → Agent wallet). Without the header the connector can search and read listings only.

Alternative (`claude_desktop_config.json`):

```json
{ "mcpServers": { "agentshelf": { "command": "npx", "args": ["-y", "mcp-remote", "https://<your-host>/mcp", "--transport", "http-only", "--header", "Authorization:${AUTH_HEADER}"], "env": { "AUTH_HEADER": "Bearer ask_..." } } } }
```

### MCP tools

| Tool | Auth | Purpose |
| --- | --- | --- |
| `search_listings` | none | query, price, category, condition, distance (`near` ZIP or lat,lng), delivery, seller rating → listing cards + match reason |
| `get_listing` | none | photos, specs, delivery, seller profile, reviews; `seller_description` labelled untrusted |
| `message_seller`, `get_messages` | buyer | in-app chat, messages labelled as sent by the buyer's agent |
| `get_my_policy` | buyer | caps, remaining monthly budget, approval threshold, wallet status (read-only) |
| `quote_purchase` | buyer | total incl. shipping, `quote_id` (5 min), policy result AUTO / NEEDS_APPROVAL / BLOCKED + reasons |
| `buy` | buyer | re-checks every rule; COMPLETED with receipt, NEEDS_APPROVAL with `approval_url`, or REJECTED. Idempotent per quote |
| `get_order_status`, `list_my_orders`, `rate_order` | buyer | status, tracking, pickup address after payment; reviews |

A schema.org product feed is at `/feed.json` and every listing page carries Product JSON-LD for non-MCP agents.

## Deploy on Railway (with GitHub)

1. Push this repo to GitHub and create a Railway project **from the repo** (root directory `/`). `railway.json` / `nixpacks.toml` build the web app and run migrations on start.
2. Add a **Postgres** service in the same project (Railway's image includes pgvector) and set `DATABASE_URL` on the web service from its `DATABASE_URL` variable. If `CREATE EXTENSION vector` is unavailable, use a Supabase Postgres URL instead.
3. Set the variables from the table above (`APP_URL` = your Railway domain, `STORAGE_PROVIDER=supabase` with a public bucket, or attach a Railway **volume** at `/data` and set `UPLOADS_DIR=/data/uploads` for local storage).
4. Point the PayPal webhook at `https://<domain>/api/webhooks/paypal` and set `PAYPAL_WEBHOOK_ID`.
5. Optional: a second Railway service from the same repo with start command `pnpm --filter @agentshelf/mcp start` for a dedicated MCP host, and a cron (Railway cron schedule) calling `POST /api/cron/housekeeping` with `Authorization: Bearer $INTERNAL_API_SECRET` to expire reservations.

A `render.yaml` blueprint is included as well.

## Development

```bash
pnpm -r typecheck     # all packages
pnpm -r test          # vitest: policy engine, money/schemas, full commerce flow on in-memory PGlite with the PayPal mock
pnpm db:migrate       # apply supabase/migrations to DATABASE_URL or PGlite
```

Data model and routes follow `docs/AgentShelf_Implementation_Plan.pdf` (sections 9 and 10).

## License

MIT
