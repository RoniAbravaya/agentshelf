import { z } from "zod";
import { parseMandate, unauthenticated } from "@agentshelf/core";
import { handler, json, parseBody } from "@/lib/api";
import { assertSameOrigin, currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Input = z.object({ text: z.string().trim().min(5).max(1500), home_zip: z.string().trim().regex(/^\d{5}$/).optional(), provider: z.enum(["anthropic", "openai", "stub"]).optional() });

/** Plain-language rules -> policy draft for the buyer to confirm. */
export const POST = handler(async (req) => {
  await assertSameOrigin();
  const user = await currentUser();
  if (!user) throw unauthenticated();
  const input = await parseBody(req, Input);
  const result = await parseMandate({ text: input.text, homeZip: input.home_zip ?? null, provider: input.provider });
  return json(result);
});
