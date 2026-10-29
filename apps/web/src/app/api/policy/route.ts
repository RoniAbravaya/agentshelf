import { policyView, savePolicy, unauthenticated } from "@agentshelf/core";
import { handler, json } from "@/lib/api";
import { assertSameOrigin, currentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const user = await currentUser();
  if (!user) throw unauthenticated();
  return json({ policy: await policyView(await db(), user.id) });
});

/** Save the confirmed policy as a new version. */
export const PUT = handler(async (req) => {
  await assertSameOrigin();
  const user = await currentUser();
  if (!user) throw unauthenticated();
  const saved = await savePolicy(await db(), user.id, await req.json());
  return json(saved);
});
