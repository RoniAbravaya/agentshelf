import { eq } from "drizzle-orm";
import { z } from "zod";
import { publicName } from "@agentshelf/shared";
import { hashPassword, verifyPassword } from "../auth/session";
import { decryptString, encryptString } from "../crypto";
import type { Db } from "../db/client";
import { sellers, users, type Seller, type User } from "../db/schema";
import { newId } from "../ids";
import { audit } from "./audit";
import { conflict, notFound, unauthenticated, validation } from "./errors";

export const SignupInput = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(200),
  display_name: z.string().trim().min(2).max(60),
  /** PayPal email that should receive payments when this user sells. Defaults to the login email. */
  paypal_payee_email: z.string().trim().toLowerCase().email().optional(),
});
export type SignupInput = z.infer<typeof SignupInput>;

export async function signup(db: Db, input: SignupInput): Promise<User> {
  const existing = await db.query.users.findFirst({ where: eq(users.email, input.email) });
  if (existing) throw conflict("An account with this email already exists");
  const id = newId("user");
  const passwordHash = await hashPassword(input.password);
  await db.transaction(async (tx) => {
    await tx.insert(users).values({ id, email: input.email, passwordHash, displayName: input.display_name, role: "both" });
    await tx.insert(sellers).values({
      userId: id,
      displayName: input.display_name,
      paypalPayeeEmail: input.paypal_payee_email ?? input.email,
    });
    await audit(tx, { actor: "system", action: "user.signup", entity: "user", entityId: id });
  });
  const user = await db.query.users.findFirst({ where: eq(users.id, id) });
  if (!user) throw notFound("user");
  return user;
}

export async function login(db: Db, email: string, password: string): Promise<User> {
  const user = await db.query.users.findFirst({ where: eq(users.email, email.trim().toLowerCase()) });
  if (!user || !(await verifyPassword(password, user.passwordHash))) throw unauthenticated("Invalid email or password");
  return user;
}

export async function getUser(db: Db, id: string): Promise<User | null> {
  return (await db.query.users.findFirst({ where: eq(users.id, id) })) ?? null;
}

export async function getSeller(db: Db, userId: string): Promise<Seller | null> {
  return (await db.query.sellers.findFirst({ where: eq(sellers.userId, userId) })) ?? null;
}

export const SellerSettingsInput = z.object({
  display_name: z.string().trim().min(2).max(60).optional(),
  paypal_payee_email: z.string().trim().toLowerCase().email().optional(),
  contact_phone: z.string().trim().max(30).nullable().optional(),
  share_contact_after_purchase: z.boolean().optional(),
  bio: z.string().trim().max(300).nullable().optional(),
});

export async function updateSellerSettings(db: Db, userId: string, input: z.infer<typeof SellerSettingsInput>): Promise<Seller> {
  const seller = await getSeller(db, userId);
  if (!seller) throw notFound("seller");
  const patch: Partial<typeof sellers.$inferInsert> = {};
  if (input.display_name) patch.displayName = input.display_name;
  if (input.paypal_payee_email) patch.paypalPayeeEmail = input.paypal_payee_email;
  if (input.contact_phone !== undefined) patch.contactPhoneEnc = input.contact_phone ? encryptString(input.contact_phone) : null;
  if (input.share_contact_after_purchase !== undefined) patch.shareContactAfterPurchase = input.share_contact_after_purchase;
  if (input.bio !== undefined) patch.bio = input.bio;
  if (Object.keys(patch).length === 0) throw validation("Nothing to update");
  await db.update(sellers).set(patch).where(eq(sellers.userId, userId));
  if (input.display_name) await db.update(users).set({ displayName: input.display_name }).where(eq(users.id, userId));
  return (await getSeller(db, userId))!;
}

/** What buyers may see about a seller. Contact details only after purchase and only if opted in. */
export interface SellerPublicProfile {
  seller_id: string;
  display_name: string;
  rating: number | null;
  review_count: number;
  items_sold: number;
  member_since: string;
  median_reply_minutes: number | null;
  bio: string | null;
}

export function sellerPublicProfile(s: Seller): SellerPublicProfile {
  return {
    seller_id: s.userId,
    display_name: publicName(s.displayName),
    rating: s.ratingAvg == null ? null : Math.round(s.ratingAvg * 10) / 10,
    review_count: s.reviewCount,
    items_sold: s.itemsSold,
    member_since: s.memberSince.toISOString(),
    median_reply_minutes: s.medianReplyMinutes,
    bio: s.bio,
  };
}

export function sellerContactForBuyer(s: Seller): { phone: string | null } {
  if (!s.shareContactAfterPurchase || !s.contactPhoneEnc) return { phone: null };
  try {
    return { phone: decryptString(s.contactPhoneEnc) };
  } catch {
    return { phone: null };
  }
}
