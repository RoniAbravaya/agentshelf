import { z } from "zod";
import { listConversationsForUser, sendMessage, unauthenticated } from "@agentshelf/core";
import { handler, json, parseBody } from "@/lib/api";
import { assertSameOrigin, currentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const user = await currentUser();
  if (!user) throw unauthenticated();
  return json({ conversations: await listConversationsForUser(await db(), user.id) });
});

const NewMessage = z.object({ listing_id: z.string(), text: z.string().trim().min(1).max(1000) });

/** Start (or continue) a conversation about a listing as the buyer. */
export const POST = handler(async (req) => {
  await assertSameOrigin();
  const user = await currentUser();
  if (!user) throw unauthenticated();
  const input = await parseBody(req, NewMessage);
  const { conversation, message } = await sendMessage(await db(), { listingId: input.listing_id, senderUserId: user.id, sender: "buyer", body: input.text });
  return json({ conversation_id: conversation.id, message_id: message.id });
});
