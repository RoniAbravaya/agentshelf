"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Key = { id: string; label: string; prefix: string; created_at: string; last_used_at: string | null; revoked_at: string | null };

export function AgentKeysPanel({ keys, mcpUrl }: { keys: Key[]; mcpUrl: string }) {
  const router = useRouter();
  const [label, setLabel] = useState("Claude Desktop");
  const [created, setCreated] = useState<{ key: string; label: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/agent-keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create key");
      setCreated({ key: data.key, label: data.label });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function revoke(id: string) {
    if (!confirm("Revoke this key?")) return;
    await fetch("/api/agent-keys", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    router.refresh();
  }

  const active = keys.filter((k) => !k.revoked_at);
  return (
    <div className="flex flex-col gap-3.5 text-sm">
      <p className="text-ink-2">Your agent authenticates to the MCP server with a Bearer key. Read tools work without a key; buying needs it. Keys are stored hashed and shown once.</p>
      {active.length > 0 && (
        <div className="flex flex-col gap-2">
          {active.map((k) => (
            <div key={k.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line px-3.5 py-3">
              <span className="mono rounded-lg bg-surface-2 px-2.5 py-1.5 text-[13px]">{k.prefix}…</span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <strong>{k.label}</strong>
                <span className="text-xs text-muted">
                  Created {new Date(k.created_at).toLocaleDateString()}
                  {k.last_used_at ? ` · last used ${new Date(k.last_used_at).toLocaleString()}` : " · never used"}
                </span>
              </span>
              <button className="btn-secondary btn-sm sm:ml-auto" type="button" onClick={() => revoke(k.id)}>
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2.5">
        <label htmlFor="label" className="sr-only">
          Key label
        </label>
        <input id="label" className="input flex-[1_1_200px]" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label" />
        <button className="btn-primary" type="button" onClick={create} disabled={busy}>
          Create key
        </button>
        <a className="btn-secondary" href="/agent">
          Open the demo agent
        </a>
      </div>
      {created && (
        <div className="flex flex-col gap-2 rounded-xl bg-ok-soft p-3.5">
          <div className="font-semibold text-ok">New key for {created.label} (copy it now; it will not be shown again):</div>
          <code className="mono block break-all rounded-lg bg-white p-2.5 text-xs">{created.key}</code>
          <a className="btn-secondary self-start" href={`/agent#key=${encodeURIComponent(created.key)}`}>
            Open the demo agent with this key
          </a>
        </div>
      )}
      {error && <p className="text-danger">{error}</p>}
      <div className="tone-dark flex flex-col gap-2.5 rounded-[14px] px-[18px] py-4 text-[13px] leading-relaxed">
        <strong className="text-sm text-white">Claude Desktop → Settings → Connectors → Add custom connector</strong>
        <span>
          URL <code className="mono text-[#c4b5fd]">{mcpUrl}</code>
        </span>
        <span>
          Header <code className="mono text-[#c4b5fd]">Authorization: Bearer ask_…</code> (leave it out for read-only browsing)
        </span>
        <span className="text-[#9aa3b2]">Then ask: “Find me a Canon AE-1 in good condition under $120.” The agent calls search_listings → quote_purchase → buy.</span>
        <span className="text-[#9aa3b2]">
          Alternative via mcp-remote in claude_desktop_config.json: <code className="mono">npx -y mcp-remote {mcpUrl} --transport http-only --header &quot;Authorization:Bearer &lt;key&gt;&quot;</code>
        </span>
      </div>
    </div>
  );
}
