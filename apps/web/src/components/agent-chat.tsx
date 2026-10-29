"use client";

import { useEffect, useRef, useState } from "react";

type Step = { tool: string; input: unknown; output: string; is_error: boolean };
type Turn = { role: "user" | "assistant"; text: string; steps?: Step[] };
type ToolInfo = { name: string; description?: string; inputSchema: { properties?: Record<string, { description?: string; type?: string; enum?: string[] }>; required?: string[] } };

const SUGGESTIONS = ["Find me a Canon AE-1 film camera in good condition under $120.", "What are my spending rules?", "Ask the seller of the Canon AE-1 whether the light meter works.", "Buy it, I'll pick it up.", "Show my recent orders."];

function summarizeStep(s: Step): string {
  const t = s.output.trim();
  const first = t.split("\n")[0] ?? "";
  return first.length > 90 ? first.slice(0, 90) + "…" : first;
}

export function AgentChat({ llmAvailable, model, provider, mcpUrl }: { llmAvailable: boolean; model: string; provider: "anthropic" | "openai" | null; mcpUrl: string }) {
  const [key, setKey] = useState("");
  const [keyOpen, setKeyOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [history, setHistory] = useState<unknown[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [toolName, setToolName] = useState("search_listings");
  const [toolArgs, setToolArgs] = useState<Record<string, string>>({ query: "film camera" });
  const [toolOut, setToolOut] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const fromHash = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("key");
      const stored = window.localStorage.getItem("agentshelf_buyer_key");
      const k = fromHash ?? stored ?? "";
      if (k) setKey(k);
      if (fromHash) {
        window.localStorage.setItem("agentshelf_buyer_key", fromHash);
        window.history.replaceState(null, "", window.location.pathname);
      }
    } catch {
      /* ignore */
    }
    void fetch("/api/agent/tool", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) })
      .then((r) => r.json())
      .then((d) => setTools(d.tools ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [turns, busy]);

  function saveKey(v: string) {
    setKey(v);
    try {
      window.localStorage.setItem("agentshelf_buyer_key", v);
    } catch {
      /* ignore */
    }
  }

  async function send(text: string) {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    const nextTurns = [...turns, { role: "user" as const, text }];
    setTurns(nextTurns);
    setInput("");
    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [...history, { role: "user", content: text }], buyer_key: key || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Agent failed");
      setHistory(data.messages);
      setTurns([...nextTurns, { role: "assistant", text: data.reply || "(no reply)", steps: data.steps }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function callTool() {
    setBusy(true);
    setToolOut(null);
    try {
      const schema = tools.find((t) => t.name === toolName)?.inputSchema;
      const args: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(toolArgs)) {
        if (v === "") continue;
        const type = schema?.properties?.[k]?.type;
        args[k] = type === "number" || type === "integer" ? Number(v) : type === "boolean" ? v === "true" : v;
      }
      const res = await fetch("/api/agent/tool", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: toolName, args, buyer_key: key || null }) });
      const data = await res.json();
      setToolOut(res.ok ? data.text : data.error);
    } finally {
      setBusy(false);
    }
  }

  const selected = tools.find((t) => t.name === toolName);
  const providerLabel = provider === "anthropic" ? "Claude" : provider === "openai" ? "OpenAI" : null;

  return (
    <div className="flex flex-col gap-4">
      <section className="card flex min-h-[60vh] flex-col overflow-hidden">
        <div className="flex flex-wrap items-center gap-2.5 border-b border-line px-4 py-3.5 md:px-5">
          <h1 className="font-display text-xl font-extrabold">Demo shopping agent</h1>
          {providerLabel && <span className="badge-ai">{providerLabel} {model} · tools via MCP</span>}
          <button type="button" onClick={() => setKeyOpen((o) => !o)} className="ml-auto flex items-center gap-2 text-[13px] text-ink-2">
            <span className={`h-2 w-2 rounded-full ${key ? "bg-[#16a34a]" : "bg-[#9aa3b2]"}`} />
            {key ? `Buyer key: ${key.slice(0, 10)}…` : "No buyer key (read-only)"}
          </button>
        </div>
        {keyOpen && (
          <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-4 py-3 text-sm md:px-5">
            <label className="label mb-0">Buyer key</label>
            <input className="input mono max-w-md text-xs" placeholder="ask_… (from Settings → Agent wallet)" value={key} onChange={(e) => saveKey(e.target.value)} />
            <span className="text-xs text-muted">Lets the agent quote and buy under that buyer&apos;s rules.</span>
          </div>
        )}

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4 md:p-5">
          {turns.length === 0 && (
            <div className="flex flex-col gap-3 text-sm text-ink-2">
              <p>
                {llmAvailable ? "The same MCP server Claude Desktop connects to, driven here with tool use. Try:" : "No LLM key is set on the server, so the chat is off; use the tool console below or connect Claude Desktop to "}
                {!llmAvailable && <code className="mono text-xs">{mcpUrl}</code>}
              </p>
              {llmAvailable && (
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} type="button" className="chip text-left" onClick={() => send(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {turns.map((t, i) =>
            t.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="bubble-user">{t.text}</div>
              </div>
            ) : (
              <div key={i} className="flex max-w-[88%] flex-col gap-2">
                {t.steps?.map((s, j) => (
                  <details key={j} className={`rounded-xl border px-3 py-2 text-xs ${s.is_error ? "border-[#fecaca] bg-danger-soft" : s.tool === "buy" ? "border-[#bbf7d0] bg-[#f0fdf4]" : "tone-ai"}`}>
                    <summary className={`mono cursor-pointer font-semibold ${s.is_error ? "text-danger" : s.tool === "buy" ? "text-ok" : "text-violet"}`}>
                      {s.tool}({JSON.stringify(s.input)}) → {summarizeStep(s)}
                    </summary>
                    <pre className="mt-1.5 max-h-56 overflow-auto whitespace-pre-wrap text-[11px] leading-snug text-ink">{s.output}</pre>
                  </details>
                ))}
                <div className="bubble-agent whitespace-pre-line">{t.text}</div>
              </div>
            ),
          )}
          {busy && turns.length > 0 && <div className="text-xs text-muted">Agent is working…</div>}
          <div ref={endRef} />
        </div>

        <form
          className="flex gap-2 border-t border-line bg-white p-3 md:px-5"
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <input className="input" placeholder={llmAvailable ? "Find me a vintage camera under $120…" : "Chat unavailable without an LLM key"} value={input} onChange={(e) => setInput(e.target.value)} disabled={!llmAvailable || busy} />
          <button className="btn-primary" type="submit" disabled={!llmAvailable || busy} aria-label="Send">
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
          {turns.length > 0 && (
            <button
              className="btn-secondary"
              type="button"
              onClick={() => {
                setTurns([]);
                setHistory([]);
              }}
            >
              Reset
            </button>
          )}
        </form>
        {error && <p className="px-4 pb-3 text-sm text-danger md:px-5">{error}</p>}
      </section>

      <details className="card p-4" open={!llmAvailable}>
        <summary className="cursor-pointer font-display text-base font-extrabold">Tool console (call MCP tools directly)</summary>
        <div className="mt-3 flex flex-col gap-3 text-sm">
          <div className="flex flex-wrap gap-2">
            <select
              className="input max-w-xs"
              value={toolName}
              onChange={(e) => {
                setToolName(e.target.value);
                setToolArgs({});
                setToolOut(null);
              }}
            >
              {tools.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
            <button className="btn-primary" type="button" onClick={callTool} disabled={busy || !selected}>
              Call
            </button>
          </div>
          {selected && (
            <div className="grid gap-2 sm:grid-cols-2">
              <p className="text-xs text-muted sm:col-span-2">{selected.description}</p>
              {Object.entries(selected.inputSchema.properties ?? {}).map(([k, p]) => (
                <label key={k} className="text-xs text-ink-2">
                  {k}
                  {selected.inputSchema.required?.includes(k) ? " *" : ""}
                  {p.enum ? (
                    <select className="input mt-1" value={toolArgs[k] ?? ""} onChange={(e) => setToolArgs({ ...toolArgs, [k]: e.target.value })}>
                      <option value="">-</option>
                      {p.enum.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input className="input mt-1" placeholder={p.description ?? p.type} value={toolArgs[k] ?? ""} onChange={(e) => setToolArgs({ ...toolArgs, [k]: e.target.value })} />
                  )}
                </label>
              ))}
            </div>
          )}
          {toolOut && <pre className="mono max-h-80 overflow-auto rounded-xl bg-ink p-3 text-xs text-[#e8ecf3]">{toolOut}</pre>}
        </div>
      </details>
    </div>
  );
}
