import type { Db, Tx } from "../db/client";
import { auditEvents } from "../db/schema";

export type Actor = "seller" | "buyer" | "agent" | "system";

export async function audit(
  db: Db | Tx,
  entry: { actor: Actor; actorId?: string | null; action: string; entity: string; entityId?: string | null; details?: unknown },
): Promise<void> {
  try {
    await db.insert(auditEvents).values({
      actor: entry.actor,
      actorId: entry.actorId ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      details: entry.details ?? null,
    });
  } catch (err) {
    // Audit must never break a money-moving path.
    console.error("audit failed", err);
  }
}
