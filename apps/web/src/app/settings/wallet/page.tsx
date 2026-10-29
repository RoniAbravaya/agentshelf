import { availableAiProviders, getCurrentPolicy, getEnv, getPayPal, listAgentKeys, policyView, walletView } from "@agentshelf/core";
import { AgentKeysPanel } from "@/components/agent-keys-panel";
import { MandateEditor } from "@/components/mandate-editor";
import { WalletPanel } from "@/components/wallet-panel";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agent wallet" };

export default async function WalletSettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string; cancelled?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser("/settings/wallet");
  const database = await db();
  const [wallet, view, current, keys] = await Promise.all([walletView(database, user.id), policyView(database, user.id), getCurrentPolicy(database, user.id), listAgentKeys(database, user.id)]);
  const env = getEnv();
  const paypal = getPayPal();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Agent wallet & spending rules</h1>
        <p className="text-sm text-slate-600">Let an AI agent shop for you with hard limits you control. The agent never sees your PayPal wallet; it only gets an AgentShelf key.</p>
      </div>
      {sp.saved && <div className="rounded-lg bg-green-50 p-3 text-sm text-green-800">PayPal wallet saved. Agent purchases within your rules will be paid automatically.</div>}
      {sp.error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{sp.error}</div>}
      {sp.cancelled && <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">PayPal approval cancelled.</div>}

      <section className="card space-y-3 p-5">
        <h2 className="font-semibold">1. Spending rules</h2>
        <MandateEditor
          providers={availableAiProviders()}
          current={current ? { policy: current.policy, version: current.version } : null}
          view={view}
          homeLabel={current?.policy.home_geo?.label ?? null}
        />
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="font-semibold">2. Saved PayPal wallet (Vault)</h2>
        <WalletPanel wallet={wallet} paypalMode={paypal?.mode ?? "none"} />
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="font-semibold">3. Connect your agent</h2>
        <AgentKeysPanel keys={keys.map((k) => ({ id: k.id, label: k.label, prefix: k.keyPrefix, created_at: k.createdAt.toISOString(), last_used_at: k.lastUsedAt?.toISOString() ?? null, revoked_at: k.revokedAt?.toISOString() ?? null }))} mcpUrl={`${env.APP_URL}/mcp`} />
      </section>
    </div>
  );
}
