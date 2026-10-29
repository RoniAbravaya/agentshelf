import { getEnv } from "@agentshelf/core";
import { AgentChat } from "@/components/agent-chat";

export const dynamic = "force-dynamic";
export const metadata = { title: "Demo agent" };

export default function AgentPage() {
  const env = getEnv();
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Demo shopping agent</h1>
        <p className="text-sm text-slate-600">
          The same MCP server Claude Desktop connects to (<code>{env.APP_URL}/mcp</code>), driven here by Claude with tool use. Paste a buyer key from Settings → Agent wallet to let it quote and buy under that buyer&apos;s spending rules; without a key it can only search.
        </p>
      </div>
      <AgentChat llmAvailable={Boolean(env.ANTHROPIC_API_KEY)} model={env.ANTHROPIC_MODEL} />
    </div>
  );
}
