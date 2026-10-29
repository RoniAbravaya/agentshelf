import { and, desc, eq, sql } from "drizzle-orm";
import { sanitizeSellerText } from "@agentshelf/shared";
import type { Db, Tx } from "../db/client";
import { conversations, listings, messages, sellers, type Conversation, type Message } from "../db/schema";
import { newId } from "../ids";
import { audit } from "./audit";
import { forbidden, notFound, validation } from "./errors";

export type Sender = "buyer" | "buyer_agent" | "seller";

/** Find or create the one conversation between a buyer and a listing's seller. */
export async function getOrCreateConversation(db: Db | Tx, listingId: string, buyerId: string): Promise<Conversation> {
  const existing = await db.query.conversations.findFirst({
    where: and(eq(conversations.listingId, listingId), eq(conversations.buyerId, buyerId)),
  });
  if (existing) return existing;
  const listing = await db.query.listings.findFirst({ where: eq(listings.id, listingId) });
  if (!listing || listing.status === "REMOVED" || listing.status === "DRAFT") throw notFound("listing");
  if (listing.sellerId === buyerId) throw validation("You cannot message yourself about your own listing");
  const [row] = await db
    .insert(conversations)
    .values({ id: newId("conversation"), listingId, buyerId, sellerId: listing.sellerId })
    .returning();
  return row!;
}

export async function sendMessage(
  db: Db,
  input: { conversationId?: string; listingId?: string; senderUserId: string; sender: Sender; body: string },
): Promise<{ conversation: Conversation; message: Message }> {
  const body = input.body.trim();
  if (!body) throw validation("Message is empty");
  if (body.length > 1000) throw validation("Message is too long (max 1000 characters)");

  let conversation: Conversation;
  if (input.conversationId) {
    const c = await db.query.conversations.findFirst({ where: eq(conversations.id, input.conversationId) });
    if (!c) throw notFound("conversation");
    conversation = c;
  } else if (input.listingId) {
    if (input.sender === "seller") throw validation("Sellers reply inside an existing conversation");
    conversation = await getOrCreateConversation(db, input.listingId, input.senderUserId);
  } else throw validation("conversationId or listingId is required");

  const isBuyer = conversation.buyerId === input.senderUserId;
  const isSeller = conversation.sellerId === input.senderUserId;
  if (input.sender === "seller" ? !isSeller : !isBuyer) throw forbidden("You are not part of this conversation");

  const [message] = await db
    .insert(messages)
    .values({ id: newId("message"), conversationId: conversation.id, sender: input.sender, body })
    .returning();
  await db.update(conversations).set({ lastMessageAt: new Date() }).where(eq(conversations.id, conversation.id));
  if (input.sender === "seller") await updateReplyTime(db, conversation);
  await audit(db, {
    actor: input.sender === "seller" ? "seller" : input.sender === "buyer_agent" ? "agent" : "buyer",
    actorId: input.senderUserId,
    action: "message.send",
    entity: "conversation",
    entityId: conversation.id,
  });
  return { conversation, message: message! };
}

/** Seller profile: median minutes to first reply across conversations (simple running estimate). */
async function updateReplyTime(db: Db, conversation: Conversation): Promise<void> {
  const rows = await db
    .select({
      sender: messages.sender,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(eq(messages.conversationId, conversation.id))
    .orderBy(messages.createdAt);
  let firstBuyer: Date | null = null;
  let firstReply: Date | null = null;
  for (const r of rows) {
    if (r.sender !== "seller" && !firstBuyer) firstBuyer = r.createdAt;
    if (r.sender === "seller" && firstBuyer && !firstReply) {
      firstReply = r.createdAt;
      break;
    }
  }
  if (!firstBuyer || !firstReply) return;
  const minutes = Math.max(1, Math.round((firstReply.getTime() - firstBuyer.getTime()) / 60000));
  const seller = await db.query.sellers.findFirst({ where: eq(sellers.userId, conversation.sellerId) });
  if (!seller) return;
  const next = seller.medianReplyMinutes == null ? minutes : Math.round((seller.medianReplyMinutes + minutes) / 2);
  await db.update(sellers).set({ medianReplyMinutes: next }).where(eq(sellers.userId, conversation.sellerId));
}

export async function getConversationForUser(db: Db, conversationId: string, userId: string): Promise<{ conversation: Conversation; messages: Message[] }> {
  const conversation = await db.query.conversations.findFirst({ where: eq(conversations.id, conversationId) });
  if (!conversation) throw notFound("conversation");
  if (conversation.buyerId !== userId && conversation.sellerId !== userId) throw forbidden("Not your conversation");
  const rows = await db.query.messages.findMany({ where: eq(messages.conversationId, conversationId), orderBy: [desc(messages.createdAt)], limit: 100 });
  await db
    .update(messages)
    .set({ readAt: new Date() })
    .where(and(eq(messages.conversationId, conversationId), sql`${messages.readAt} IS NULL`, sql`${messages.sender} <> ${conversation.buyerId === userId ? "buyer" : "seller"}`));
  return { conversation, messages: rows };
}

export async function listConversationsForUser(db: Db, userId: string): Promise<Array<Conversation & { listing_title: string; last_message: string | null; unread: number }>> {
  const rows = await db
    .select({
      conversation: conversations,
      listingTitle: listings.title,
      lastMessage: sql<string | null>`(select body from messages m where m.conversation_id = ${conversations.id} order by m.created_at desc limit 1)`,
      // Unread = messages from the other party that this user has not read yet.
      unread: sql<number>`(select count(*)::int from messages m where m.conversation_id = ${conversations.id} and m.read_at is null and (case when ${conversations.buyerId} = ${userId} then m.sender = 'seller' else m.sender <> 'seller' end))`,
    })
    .from(conversations)
    .innerJoin(listings, eq(listings.id, conversations.listingId))
    .where(sql`${conversations.buyerId} = ${userId} OR ${conversations.sellerId} = ${userId}`)
    .orderBy(desc(conversations.lastMessageAt))
    .limit(50);
  return rows.map((r) => ({ ...r.conversation, listing_title: r.listingTitle, last_message: r.lastMessage, unread: r.unread }));
}

/** Messages as returned to an agent: seller text sanitised and labelled. */
export function messagesForAgent(rows: Message[]) {
  return rows.map((m) => ({
    id: m.id,
    sender: m.sender as Sender,
    body: m.sender === "seller" ? sanitizeSellerText(m.body) : m.body,
    created_at: m.createdAt.toISOString(),
  }));
}
