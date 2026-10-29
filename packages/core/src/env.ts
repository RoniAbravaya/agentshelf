import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

/**
 * Loads the repo-root .env into process.env (without overriding values that are
 * already set). Next.js only reads env files from the app directory, so both apps
 * call this at startup to share one .env at the monorepo root.
 */
export function loadRootEnv(startDir = process.cwd()): string | null {
  let dir = startDir;
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, ".env");
    if (fs.existsSync(candidate) && fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
      applyEnvFile(candidate);
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function applyEnvFile(file: string): void {
  const text = fs.readFileSync(file, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined || process.env[key] === "") process.env[key] = value;
  }
}

/** Find the monorepo root (directory containing pnpm-workspace.yaml). */
export function findRepoRoot(startDir = process.cwd()): string {
  let dir = startDir;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return startDir;
}

const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optionalString = z.preprocess(emptyToUndefined, z.string().optional());

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.preprocess(emptyToUndefined, z.string().url().default("http://localhost:3000")),
  MCP_URL: z.preprocess(emptyToUndefined, z.string().url().default("http://localhost:3001")),
  MCP_PORT: z.preprocess(emptyToUndefined, z.coerce.number().int().default(3001)),
  SESSION_SECRET: z.preprocess(emptyToUndefined, z.string().min(8).default("dev-only-insecure-session-secret")),
  DATABASE_URL: optionalString,
  PGLITE_DATA_DIR: optionalString,

  PAYPAL_ENV: z.preprocess(emptyToUndefined, z.enum(["sandbox", "live"]).default("sandbox")),
  PAYPAL_CLIENT_ID: optionalString,
  PAYPAL_CLIENT_SECRET: optionalString,
  PAYPAL_WEBHOOK_ID: optionalString,
  PAYPAL_AGENT_PAYEE_MODE: z.preprocess(emptyToUndefined, z.enum(["seller", "platform"]).default("seller")),
  /** "false" disables the in-memory PayPal mock used when no sandbox credentials are set (dev/test only). */
  PAYPAL_MOCK: optionalString,

  LISTING_AI_PROVIDER: z.preprocess(emptyToUndefined, z.enum(["anthropic", "openai", "stub"]).optional()),
  ANTHROPIC_API_KEY: optionalString,
  ANTHROPIC_MODEL: z.preprocess(emptyToUndefined, z.string().default("claude-opus-5-5")),
  OPENAI_API_KEY: optionalString,
  OPENAI_MODEL: optionalString,

  EMBEDDINGS_PROVIDER: z.preprocess(emptyToUndefined, z.enum(["openai", "voyage", "none"]).default("none")),
  VOYAGE_API_KEY: optionalString,
  EMBEDDINGS_MODEL: optionalString,

  STORAGE_PROVIDER: z.preprocess(emptyToUndefined, z.enum(["local", "supabase"]).default("local")),
  UPLOADS_DIR: optionalString,
  SUPABASE_URL: optionalString,
  SUPABASE_SERVICE_ROLE_KEY: optionalString,
  SUPABASE_STORAGE_BUCKET: z.preprocess(emptyToUndefined, z.string().default("listing-photos")),

  DATA_ENCRYPTION_KEY: optionalString,
  INTERNAL_API_SECRET: z.preprocess(emptyToUndefined, z.string().default("dev-only-internal-secret")),
});
export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;
export function getEnv(): Env {
  if (cached) return cached;
  loadRootEnv();
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  }
  cached = parsed.data;
  return cached;
}

/** For tests. */
export function resetEnvCache(): void {
  cached = null;
}

export function paypalConfigured(env = getEnv()): boolean {
  return Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET);
}
