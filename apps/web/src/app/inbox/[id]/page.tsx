import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { CommerceError, getConversationForUser, schema } from "@agentshelf/core";
import { ChatThread } from "@/components/chat-thread";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Conversation" };

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/inbox/${id}`);
  const database = await db();
  let data;
  try {
    data = await getConversationForUser(database, id, user.id);
  } catch (err) {
    if (err instanceof CommerceError) notFound();
    throw err;
  }
  const listing = await database.query.listings.findFirst({ where: eq(schema.listings.id, data.conversation.listingId) });
  const role = data.conversation.sellerId === user.id ? "seller" : "buyer";
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate font-display text-xl font-extrabold">
            <Link href={`/listings/${data.conversation.listingId}`} className="hover:underline">
              {listing?.title ?? "Listing"}
            </Link>
          </h1>
          <p className="text-sm text-ink-2">{role === "seller" ? "Buyer conversation · your reply time feeds your profile" : "Conversation with the seller"}</p>
        </div>
        {data.conversation.orderId && (
          <Link className="btn-secondary" href={`/orders/${data.conversation.orderId}`}>
            View order
          </Link>
        )}
      </div>
      <ChatThread conversationId={id} role={role} initial={data.messages.map((m) => ({ id: m.id, sender: m.sender, body: m.body, created_at: m.createdAt.toISOString() })).reverse()} />
    </div>
  );
}
