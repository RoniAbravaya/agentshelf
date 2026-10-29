"use client";

import { useEffect, useState } from "react";

type Step = { tool: string; input: unknown; output: string; is_error: boolean };
type Turn = { role: "user" | "assistant"; text: string; steps?: Step[] };
type ToolInfo = { name: string; description?: string; inputSchema: { properties?: Record<string, { description?: string; type?: string; enum?: string[] }>; required?: string[] } };

const SUGGESTIONS = ["Find me a Canon AE-1 film camera in good condition under $120.", "What are my spending rules?", "Ask the seller of the Canon AE-1 whether the light meter works.", "Buy it, I'll pick it up.", "Show my recent orders."];

export function AgentChat({ llmAvailable, model }: { llmAvailable: boolean; model: string }) {
  const [key, setKey] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [history, setHistory] = useState<unknown[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [toolName, setToolName] = useState("search_listings");
  const [toolArgs, setToolArgs] = useState<Record<string, string>>({ query: "film camera" });
  const [toolOut, setToolOut] = useState<string | null>(null);

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

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-2 p-3 text-sm">
        <label className="label mb-0">Buyer key</label>
        <input className="input max-w-md font-mono text-xs" placeholder="ask_... (from Settings → Agent wallet)" value={key} onChange={(e) => saveKey(e.target.value)} />
        <span className="text-xs text-slate-500">{key ? "Purchases enabled under this buyer's rules" : "Read-only until a key is set"}</span>
      </div>

      <div className="card flex min-h-[420px] flex-col">
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {turns.length === 0 && (
            <div className="space-y-2 text-sm text-slate-500">
              <p>{llmAvailable ? `Chat with the agent (model ${model}). Try:` : "ANTHROPIC_API_KEY is not set, so the chat is off; use the tool console below or connect Claude Desktop."}</p>
              {llmAvailable && (
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} type="button" className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs hover:bg-slate-50" onClick={() => send(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {turns.map((t, i) => (
            <div key={i} className={`flex ${t.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] space-y-2 rounded-2xl px-3 py-2 text-sm ${t.role === "user" ? "bg-brand text-white" : "bg-slate-100"}`}>
                {t.steps && t.steps.length > 0 && (
                  <div className="space-y-1">
                    {t.steps.map((s, j) => (
                      <details key={j} className={`rounded-md border px-2 py-1 text-xs ${s.is_error ? "border-red-200 bg-red-50" : "border-violet-200 bg-violet-50"}`}>
                        <summary className="cursor-pointer font-mono">
                          {s.tool}({JSON.stringify(s.input)})
                        </summary>
                        <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap">{s.output}</pre>
                      </details>
                    ))}
                  </div>
                )}
                <div className="whitespace-pre-line">{t.text}</div>
              </div>
            </div>
          ))}
          {busy && turns.length > 0 && <div className="text-xs text-slate-400">Agent is working…</div>}
        </div>
        <form
          className="flex gap-2 border-t border-slate-100 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <input className="input" placeholder={llmAvailable ? "Find me a vintage camera under $120…" : "Chat unavailable without ANTHROPIC_API_KEY"} value={input} onChange={(e) => setInput(e.target.value)} disabled={!llmAvailable || busy} />
          <button className="btn-primary" type="submit" disabled={!llmAvailable || busy}>
            Send
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
        {error && <p className="px-3 pb-3 text-sm text-red-700">{error}</p>}
      </div>

      <details className="card p-4" open={!llmAvailable}>
        <summary className="cursor-pointer font-semibold">Tool console (call MCP tools directly)</summary>
        <div className="mt-3 space-y-3 text-sm">
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
              <p className="text-xs text-slate-500 sm:col-span-2">{selected.description}</p>
              {Object.entries(selected.inputSchema.properties ?? {}).map(([k, p]) => (
                <label key={k} className="text-xs">
                  {k}
                  {selected.inputSchema.required?.includes(k) ? " *" : ""}
                  {p.enum ? (
                    <select className="input" value={toolArgs[k] ?? ""} onChange={(e) => setToolArgs({ ...toolArgs, [k]: e.target.value })}>
                      <option value="">-</option>
                      {p.enum.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input className="input" placeholder={p.description ?? p.type} value={toolArgs[k] ?? ""} onChange={(e) => setToolArgs({ ...toolArgs, [k]: e.target.value })} />
                  )}
                </label>
              ))}
            </div>
          )}
          {toolOut && <pre className="max-h-80 overflow-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">{toolOut}</pre>}
        </div>
      </details>
    </div>
  );
}
