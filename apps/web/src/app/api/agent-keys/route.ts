import { z } from "zod";
import { createAgentKey, listAgentKeys, revokeAgentKey, unauthenticated } from "@agentshelf/core";
import { handler, json, parseBody } from "@/lib/api";
import { assertSameOrigin, currentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const user = await currentUser();
  if (!user) throw unauthenticated();
  const keys = await listAgentKeys(await db(), user.id);
  return json({ keys: keys.map((k) => ({ id: k.id, label: k.label, prefix: k.keyPrefix, created_at: k.createdAt, last_used_at: k.lastUsedAt, revoked_at: k.revokedAt })) });
});

/** Create an MCP key for the buyer. The plain key is returned once. */
export const POST = handler(async (req) => {
  await assertSameOrigin();
  const user = await currentUser();
  if (!user) throw unauthenticated();
  const input = await parseBody(req, z.object({ label: z.string().trim().min(1).max(60).optional() }));
  const { key, record } = await createAgentKey(await db(), user.id, input.label ?? "Claude Desktop");
  return json({ key, id: record.id, label: record.label, prefix: record.keyPrefix });
});

export const DELETE = handler(async (req) => {
  await assertSameOrigin();
  const user = await currentUser();
  if (!user) throw unauthenticated();
  const input = await parseBody(req, z.object({ id: z.string() }));
  await revokeAgentKey(await db(), user.id, input.id);
  return json({ ok: true });
});
