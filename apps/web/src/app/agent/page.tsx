import { getEnv } from "@agentshelf/core";
import { AgentChat } from "@/components/agent-chat";
import { agentProvider } from "@/app/api/agent/chat/route";

export const dynamic = "force-dynamic";
export const metadata = { title: "Demo agent" };

const CHECKS = [
  { rule: "Quote fresh", detail: "server-issued quote_id, 5 min, single use" },
  { rule: "Item available", detail: "reserved for this order inside a transaction" },
  { rule: "Caps", detail: "per-order and monthly limits, hard platform ceilings" },
  { rule: "Category & keywords", detail: "allowed categories, no blocked words" },
  { rule: "Delivery", detail: "pickup distance or shipping cost within limits" },
  { rule: "Seller", detail: "minimum rating" },
  { rule: "Approval", detail: "under the ask-me limit → AUTO, else a one-tap PayPal link" },
];

export default function AgentPage() {
  const env = getEnv();
  const llm = agentProvider(env);
  return (
    <div className="flex flex-wrap items-start gap-6">
      <div className="min-w-0 flex-[999_1_520px]">
        <AgentChat llmAvailable={Boolean(llm)} model={llm?.model ?? ""} provider={llm?.provider ?? null} mcpUrl={`${env.APP_URL}/mcp`} />
      </div>
      <aside className="hidden min-w-0 flex-[1_1_280px] flex-col gap-3.5 lg:flex lg:max-w-[340px]">
        <div className="card flex flex-col gap-3 p-[18px]">
          <span className="eyebrow">How every purchase is decided</span>
          <ol className="flex flex-col gap-2 text-[13px] leading-snug">
            {CHECKS.map((c, i) => (
              <li key={c.rule} className="flex items-start gap-2.5">
                <span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${i === CHECKS.length - 1 ? "bg-accent-soft text-accent" : "bg-ok-soft text-ok"}`}>{i === CHECKS.length - 1 ? "→" : "✓"}</span>
                <span>
                  <strong>{c.rule}</strong> <span className="text-ink-2">{c.detail}</span>
                </span>
              </li>
            ))}
          </ol>
          <span className="border-t border-line pt-2.5 text-xs text-muted">The model can propose a purchase. Only deterministic code decides whether money moves.</span>
        </div>
        <div className="tone-dark flex flex-col gap-2.5 rounded-[18px] p-[18px] text-[13px] leading-relaxed">
          <span className="eyebrow text-[#c4b5fd]">Try it in Claude Desktop instead</span>
          <span>Add a custom connector with the MCP URL and your buyer key. Same tools, same rules.</span>
          <code className="mono overflow-x-auto rounded-lg bg-[#141c2e] px-3 py-2.5 text-xs text-white">{env.APP_URL}/mcp</code>
        </div>
      </aside>
    </div>
  );
}
