import "server-only";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { getEnv } from "@agentshelf/core";

/**
 * MCP client to our own /mcp endpoint over HTTP, exactly like Claude Desktop
 * connects. The demo agent and the tool console use this so judges exercise the
 * real remote path (Bearer key, Streamable HTTP), not an in-process shortcut.
 */
export async function connectMcp(buyerKey: string | null): Promise<Client> {
  const env = getEnv();
  const base = process.env.MCP_SELF_URL ?? `${env.APP_URL}/mcp`;
  const transport = new StreamableHTTPClientTransport(new URL(base), {
    requestInit: buyerKey ? { headers: { Authorization: `Bearer ${buyerKey}` } } : undefined,
  });
  const client = new Client({ name: "agentshelf-demo-agent", version: "0.1.0" });
  await client.connect(transport);
  return client;
}

export function toolResultText(result: { content?: Array<{ type: string; text?: string }>; structuredContent?: unknown; isError?: boolean }): string {
  const text = (result.content ?? [])
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text as string)
    .join("\n");
  if (text) return text;
  return result.structuredContent ? JSON.stringify(result.structuredContent, null, 2) : "(no content)";
}
