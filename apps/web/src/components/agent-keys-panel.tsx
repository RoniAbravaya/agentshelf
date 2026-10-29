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
    <div className="space-y-3 text-sm">
      <p className="text-slate-600">
        Your agent authenticates to the MCP server with a Bearer key. Read tools work without a key; buying needs it. Keys are stored hashed and shown once.
      </p>
      <div className="flex gap-2">
        <input className="input max-w-xs" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label" />
        <button className="btn-primary" type="button" onClick={create} disabled={busy}>
          Create key
        </button>
      </div>
      {created && (
        <div className="space-y-2 rounded-md border border-green-200 bg-green-50 p-3">
          <div className="font-medium">New key for {created.label} (copy it now; it will not be shown again):</div>
          <code className="block break-all rounded bg-white p-2 text-xs">{created.key}</code>
          <a className="btn-secondary" href={`/agent#key=${encodeURIComponent(created.key)}`}>
            Open the demo agent with this key
          </a>
        </div>
      )}
      {error && <p className="text-red-700">{error}</p>}
      {active.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
          {active.map((k) => (
            <li key={k.id} className="flex items-center justify-between px-3 py-2">
              <div>
                <div className="font-medium">{k.label}</div>
                <div className="text-xs text-slate-500">
                  {k.prefix}… · created {new Date(k.created_at).toLocaleDateString()}
                  {k.last_used_at ? ` · last used ${new Date(k.last_used_at).toLocaleString()}` : " · never used"}
                </div>
              </div>
              <button className="btn-danger px-2 py-1 text-xs" type="button" onClick={() => revoke(k.id)}>
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
      <details className="rounded-md border border-slate-200 p-3">
        <summary className="cursor-pointer font-medium">How to connect Claude Desktop</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-slate-700">
          <li>
            Claude Desktop → Settings → Connectors → <strong>Add custom connector</strong>.
          </li>
          <li>
            URL: <code>{mcpUrl}</code>
          </li>
          <li>
            Add request header <code>Authorization: Bearer &lt;your key&gt;</code> (purchase tools) or leave it out for read-only browsing.
          </li>
          <li>
            Ask: <em>“Find me a Canon AE-1 in good condition under $120.”</em> The agent uses search_listings → quote_purchase → buy.
          </li>
        </ol>
        <p className="mt-2 text-xs text-slate-500">
          Alternative via mcp-remote in claude_desktop_config.json: <code>npx -y mcp-remote {mcpUrl} --transport http-only --header &quot;Authorization:Bearer &lt;key&gt;&quot;</code>
        </p>
      </details>
    </div>
  );
}
