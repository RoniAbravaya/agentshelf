import { z } from "zod";
import { handler, json, parseBody } from "@/lib/api";
import { assertSameOrigin } from "@/lib/auth";
import { connectMcp, toolResultText } from "@/lib/mcp-client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Input = z.object({ name: z.string().min(1).optional(), args: z.record(z.string(), z.unknown()).optional(), buyer_key: z.string().trim().optional().nullable() });

/** Tool console: list MCP tools or call one directly over the real HTTP transport (no LLM needed). */
export const POST = handler(async (req) => {
  await assertSameOrigin();
  const input = await parseBody(req, Input);
  const mcp = await connectMcp(input.buyer_key || null);
  try {
    if (!input.name) {
      const { tools } = await mcp.listTools();
      return json({ tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) });
    }
    const result = await mcp.callTool({ name: input.name, arguments: input.args ?? {} });
    return json({ text: toolResultText(result as never), structured: (result as { structuredContent?: unknown }).structuredContent ?? null, is_error: Boolean((result as { isError?: boolean }).isError) });
  } finally {
    await mcp.close().catch(() => {});
  }
});
