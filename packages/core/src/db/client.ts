import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { setVectorAvailable } from "../ai/embeddings";
import { findRepoRoot, getEnv } from "../env";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

let dbPromise: Promise<Db> | null = null;
let closeFn: (() => Promise<void>) | null = null;

/**
 * Returns the shared database handle.
 * - DATABASE_URL set   -> postgres-js against Supabase/any Postgres (pgvector required)
 * - DATABASE_URL unset -> embedded PGlite under ./.data/agentshelf (zero setup)
 * Migrations from supabase/migrations are applied on first use.
 */
export function getDb(): Promise<Db> {
  if (!dbPromise) dbPromise = open();
  return dbPromise;
}

async function open(): Promise<Db> {
  const env = getEnv();
  let db: Db;
  if (env.DATABASE_URL) {
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const postgres = (await import("postgres")).default;
    const client = postgres(env.DATABASE_URL, { prepare: false, max: 5 });
    db = drizzle({ client, schema }) as unknown as Db;
    closeFn = async () => {
      await client.end();
    };
  } else {
    const { drizzle } = await import("drizzle-orm/pglite");
    const { PGlite } = await import("@electric-sql/pglite");
    const { vector } = await import("@electric-sql/pglite-pgvector");
    const dataDir = env.PGLITE_DATA_DIR ?? path.join(findRepoRoot(), ".data", "agentshelf");
    fs.mkdirSync(path.dirname(dataDir), { recursive: true });
    const client = new PGlite(dataDir, { extensions: { vector } });
    await client.waitReady;
    db = drizzle({ client, schema }) as unknown as Db;
    closeFn = async () => {
      await client.close();
    };
  }
  await runMigrations(db);
  return db;
}

/** In-memory PGlite for tests. */
export async function openTestDb(): Promise<Db & { close: () => Promise<void> }> {
  const { drizzle } = await import("drizzle-orm/pglite");
  const { PGlite } = await import("@electric-sql/pglite");
  const { vector } = await import("@electric-sql/pglite-pgvector");
  const client = new PGlite({ extensions: { vector } });
  await client.waitReady;
  const db = drizzle({ client, schema }) as unknown as Db;
  await runMigrations(db);
  return Object.assign(db, { close: () => client.close() });
}

export async function closeDb(): Promise<void> {
  if (closeFn) await closeFn();
  closeFn = null;
  dbPromise = null;
}

export function migrationsDir(): string {
  return path.join(findRepoRoot(), "supabase", "migrations");
}

export async function runMigrations(db: Db): Promise<string[]> {
  await db.execute(sql`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const applied = new Set(
    (await db.select({ name: schema.schemaMigrations.name }).from(schema.schemaMigrations)).map((r) => r.name),
  );
  const dir = migrationsDir();
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const ran: string[] = [];
  const hasVector = await vectorExtensionAvailable(db);
  setVectorAvailable(hasVector);
  if (!hasVector) console.warn("pgvector is not available on this database: semantic search is disabled, full-text search still works.");
  for (const file of files) {
    if (applied.has(file)) continue;
    let text = fs.readFileSync(path.join(dir, file), "utf8");
    if (!hasVector) {
      // Degrade gracefully: keep the schema identical except the embedding column, which becomes unused text.
      text = text.replace(/CREATE EXTENSION IF NOT EXISTS vector;/g, "").replace(/vector\(\d+\)/g, "text");
    }
    await db.transaction(async (tx) => {
      // PGlite (and prepared statements generally) take one command per query.
      for (const statement of splitSqlStatements(text)) await tx.execute(sql.raw(statement));
      await tx.insert(schema.schemaMigrations).values({ name: file });
    });
    ran.push(file);
  }
  return ran;
}

let vectorAvailable: boolean | null = null;
/** True when the pgvector extension is installed or installable (PGlite with the extension, Supabase, Railway images with pgvector). */
export async function vectorExtensionAvailable(db: Db): Promise<boolean> {
  if (vectorAvailable !== null) return vectorAvailable;
  try {
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
    vectorAvailable = true;
  } catch {
    vectorAvailable = false;
  }
  return vectorAvailable;
}

/** Split a migration file into statements: strips `--` comments, splits on `;` outside quotes. */
export function splitSqlStatements(text: string): string[] {
  const out: string[] = [];
  let current = "";
  let inSingle = false;
  let inDollar = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    const next = text[i + 1];
    if (!inSingle && !inDollar && ch === "-" && next === "-") {
      while (i < text.length && text[i] !== "\n") i++;
      current += "\n";
      continue;
    }
    if (!inDollar && ch === "'") inSingle = !inSingle;
    else if (!inSingle && ch === "$" && next === "$") {
      inDollar = !inDollar;
      current += "$$";
      i++;
      continue;
    }
    if (ch === ";" && !inSingle && !inDollar) {
      if (current.trim()) out.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

export { schema };
