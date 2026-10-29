import { setListingStatus, unauthenticated, validation } from "@agentshelf/core";
import { handler, json, type RouteParams } from "@/lib/api";
import { assertSameOrigin, currentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const ACTIONS = new Set(["pause", "resume", "mark-sold", "delete", "relist"]);

/** POST /api/listings/{id}/pause | resume | mark-sold | delete | relist */
export const POST = handler(async (_req, { params }: RouteParams<{ id: string; action: string }>) => {
  await assertSameOrigin();
  const user = await currentUser();
  if (!user) throw unauthenticated();
  const { id, action } = await params;
  if (!ACTIONS.has(action)) throw validation(`Unknown action ${action}`);
  const listing = await setListingStatus(await db(), id, user.id, action as "pause" | "resume" | "mark-sold" | "delete" | "relist");
  return json({ listing });
});
