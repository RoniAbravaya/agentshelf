import { and, desc, eq, isNull } from "drizzle-orm";
import { sha256Hex } from "../crypto";
import type { Db } from "../db/client";
import { agentKeys, users, type AgentKey, type User } from "../db/schema";
import { newAgentKey, newId } from "../ids";
import { audit } from "./audit";
import { notFound } from "./errors";

/** Create a buyer API key for MCP. The plain key is returned once and stored hashed. */
export async function createAgentKey(db: Db, buyerId: string, label = "Claude Desktop"): Promise<{ key: string; record: AgentKey }> {
  const { key, prefix } = newAgentKey();
  const [record] = await db
    .insert(agentKeys)
    .values({ id: newId("agentKey"), buyerId, keyHash: sha256Hex(key), keyPrefix: prefix, label })
    .returning();
  await audit(db, { actor: "buyer", actorId: buyerId, action: "agent_key.create", entity: "agent_key", entityId: record!.id });
  return { key, record: record! };
}

export async function listAgentKeys(db: Db, buyerId: string): Promise<AgentKey[]> {
  return db.query.agentKeys.findMany({ where: eq(agentKeys.buyerId, buyerId), orderBy: [desc(agentKeys.createdAt)] });
}

export async function revokeAgentKey(db: Db, buyerId: string, keyId: string): Promise<void> {
  const row = await db.query.agentKeys.findFirst({ where: and(eq(agentKeys.id, keyId), eq(agentKeys.buyerId, buyerId)) });
  if (!row) throw notFound("key");
  await db.update(agentKeys).set({ revokedAt: new Date() }).where(eq(agentKeys.id, keyId));
  await audit(db, { actor: "buyer", actorId: buyerId, action: "agent_key.revoke", entity: "agent_key", entityId: keyId });
}

/** Resolve a Bearer key to its buyer. Returns null for unknown or revoked keys. */
export async function authenticateAgentKey(db: Db, bearer: string | undefined | null): Promise<{ buyer: User; key: AgentKey } | null> {
  if (!bearer) return null;
  const token = bearer.replace(/^Bearer\s+/i, "").trim();
  if (!token.startsWith("ask_")) return null;
  const key = await db.query.agentKeys.findFirst({ where: and(eq(agentKeys.keyHash, sha256Hex(token)), isNull(agentKeys.revokedAt)) });
  if (!key) return null;
  const buyer = await db.query.users.findFirst({ where: eq(users.id, key.buyerId) });
  if (!buyer) return null;
  void db.update(agentKeys).set({ lastUsedAt: new Date() }).where(eq(agentKeys.id, key.id)).catch(() => {});
  return { buyer, key };
}
