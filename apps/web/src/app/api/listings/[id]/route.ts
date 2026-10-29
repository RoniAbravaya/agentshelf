import { getListingDetail, notFound, publishListing, unauthenticated } from "@agentshelf/core";
import { handler, json, type RouteParams } from "@/lib/api";
import { assertSameOrigin, currentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Public listing detail (same fields agents get). */
export const GET = handler(async (req, { params }: RouteParams<{ id: string }>) => {
  const { id } = await params;
  const near = new URL(req.url).searchParams.get("near");
  const detail = await getListingDetail(await db(), id);
  if (!detail) throw notFound("listing");
  void near;
  return json(detail);
});

/** Edit details or price (blocked while reserved). */
export const PATCH = handler(async (req, { params }: RouteParams<{ id: string }>) => {
  await assertSameOrigin();
  const user = await currentUser();
  if (!user) throw unauthenticated();
  const { id } = await params;
  const listing = await publishListing(await db(), id, user.id, await req.json());
  return json({ listing });
});
