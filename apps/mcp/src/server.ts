/**
 * Standalone AgentShelf MCP server (Streamable HTTP, stateless) on Express.
 *
 * The web app already serves the same tools at /mcp. Run this separately when
 * you want the MCP endpoint on its own host/port (e.g. a second Railway/Render
 * service). It shares the database with the web app, so it needs DATABASE_URL
 * (Supabase/Postgres): embedded PGlite is single-process and cannot be shared.
 */
import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createAgentShelfMcpServer, getDb, getEnv, loadRootEnv } from "@agentshelf/core";

loadRootEnv();
const env = getEnv();
if (!env.DATABASE_URL) {
  console.error("apps/mcp needs DATABASE_URL (shared Postgres). For local zero-setup use the web app's /mcp route instead.");
  process.exit(1);
}

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "256kb" }));

app.use("/mcp", (req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin ?? "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept, MCP-Protocol-Version, Mcp-Session-Id");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

app.post("/mcp", async (req, res) => {
  const server = createAgentShelfMcpServer({ db: await getDb() });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.once("close", () => void server.close().catch(() => {}));
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP request failed", err);
    if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null });
  }
});

app.get("/mcp", (_req, res) => {
  res.set("Allow", "POST").status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null });
});
app.delete("/mcp", (_req, res) => {
  res.set("Allow", "POST").status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null });
});

app.get("/healthz", (_req, res) => res.json({ ok: true, service: "agentshelf-mcp" }));

const port = Number(process.env.PORT ?? env.MCP_PORT);
app.listen(port, "0.0.0.0", () => console.log(`AgentShelf MCP server listening on http://0.0.0.0:${port}/mcp`));
