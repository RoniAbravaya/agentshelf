import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createAgentShelfMcpServer } from "@agentshelf/core";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Remote MCP endpoint (Streamable HTTP, stateless): a fresh server + transport per
 * request. Read tools are anonymous; purchase tools read "Authorization: Bearer ask_...".
 * Claude Desktop: Settings > Connectors > Add custom connector with this URL and the header.
 */
export async function POST(req: Request) {
  const server = createAgentShelfMcpServer({ db: await db() });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    // Close lazily so a streamed response can finish.
    setTimeout(() => void server.close().catch(() => {}), 0);
  }
}

export async function GET() {
  return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed: this stateless MCP server accepts POST only." }, id: null }), {
    status: 405,
    headers: { "Content-Type": "application/json", Allow: "POST" },
  });
}

export const DELETE = GET;

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, MCP-Protocol-Version, Mcp-Session-Id",
    },
  });
}
