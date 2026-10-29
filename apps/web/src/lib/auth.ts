import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, getEnv, getUser, sessionCookieOptions, signSession, verifySession, type SessionClaims, type User } from "@agentshelf/core";
import { db } from "./db";

export async function currentSession(): Promise<SessionClaims | null> {
  const jar = await cookies();
  return verifySession(jar.get(SESSION_COOKIE)?.value);
}

export async function currentUser(): Promise<User | null> {
  const session = await currentSession();
  if (!session) return null;
  return getUser(await db(), session.sub);
}

export async function requireUser(nextPath?: string): Promise<User> {
  const user = await currentUser();
  if (!user) redirect(`/login${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""}`);
  return user;
}

export async function setSessionCookie(user: User): Promise<void> {
  const token = await signSession({ sub: user.id, email: user.email, name: user.displayName, role: user.role });
  const opts = sessionCookieOptions();
  const jar = await cookies();
  jar.set(opts.name, token, { httpOnly: opts.httpOnly, sameSite: opts.sameSite, secure: opts.secure, path: opts.path, maxAge: opts.maxAge });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/** CSRF guard for cookie-authenticated mutations from route handlers: Origin must match APP_URL (or be absent). */
export async function assertSameOrigin(): Promise<void> {
  const h = await headers();
  const origin = h.get("origin");
  if (!origin) return;
  const allowed = new URL(getEnv().APP_URL).origin;
  const host = h.get("host");
  if (origin !== allowed && (!host || new URL(origin).host !== host)) {
    throw Object.assign(new Error("Cross-origin request blocked"), { status: 403 });
  }
}
