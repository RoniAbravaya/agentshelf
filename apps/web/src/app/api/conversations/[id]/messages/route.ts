import { z } from "zod";
import { getConversationForUser, sendMessage, unauthenticated } from "@agentshelf/core";
import { handler, json, parseBody, type RouteParams } from "@/lib/api";
import { assertSameOrigin, currentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export const GET = handler(async (_req, { params }: RouteParams<{ id: string }>) => {
  const user = await currentUser();
  if (!user) throw unauthenticated();
  const { id } = await params;
  const { conversation, messages } = await getConversationForUser(await db(), id, user.id);
  return json({ conversation, messages });
});

const Input = z.object({ text: z.string().trim().min(1).max(1000) });

export const POST = handler(async (req, { params }: RouteParams<{ id: string }>) => {
  await assertSameOrigin();
  const user = await currentUser();
  if (!user) throw unauthenticated();
  const { id } = await params;
  const input = await parseBody(req, Input);
  const database = await db();
  const { conversation } = await getConversationForUser(database, id, user.id);
  const sender = conversation.sellerId === user.id ? "seller" : "buyer";
  const result = await sendMessage(database, { conversationId: id, senderUserId: user.id, sender, body: input.text });
  return json({ message: result.message });
});
