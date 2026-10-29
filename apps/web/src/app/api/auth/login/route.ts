import { z } from "zod";
import { login } from "@agentshelf/core";
import { handler, json, parseBody } from "@/lib/api";
import { setSessionCookie } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** JSON login for scripts and the E2E runner (the UI uses a server action). */
export const POST = handler(async (req) => {
  const input = await parseBody(req, z.object({ email: z.string().email(), password: z.string().min(1) }));
  const user = await login(await db(), input.email, input.password);
  await setSessionCookie(user);
  return json({ user: { id: user.id, email: user.email, display_name: user.displayName } });
});
