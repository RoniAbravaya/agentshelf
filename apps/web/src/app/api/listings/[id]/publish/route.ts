import { publishListing, unauthenticated } from "@agentshelf/core";
import { handler, json, type RouteParams } from "@/lib/api";
import { assertSameOrigin, currentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Validate, embed, set AVAILABLE (also used for edits of a live listing). */
export const POST = handler(async (req, { params }: RouteParams<{ id: string }>) => {
  await assertSameOrigin();
  const user = await currentUser();
  if (!user) throw unauthenticated();
  const { id } = await params;
  const body = await req.json();
  const listing = await publishListing(await db(), id, user.id, body);
  return json({ listing });
});
