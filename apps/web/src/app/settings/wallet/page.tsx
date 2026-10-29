import { availableAiProviders, getCurrentPolicy, getEnv, getPayPal, listAgentKeys, policyView, walletView } from "@agentshelf/core";
import { AgentKeysPanel } from "@/components/agent-keys-panel";
import { MandateEditor } from "@/components/mandate-editor";
import { SettingsNav } from "@/components/settings-nav";
import { WalletPanel } from "@/components/wallet-panel";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agent wallet" };

function StepHeading({ n, title, badge }: { n: string; title: string; badge?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-ink font-display text-sm font-extrabold text-white">{n}</span>
      <h2 className="font-display text-xl font-extrabold">{title}</h2>
      {badge && <span className="ml-auto">{badge}</span>}
    </div>
  );
}

export default async function WalletSettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string; cancelled?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser("/settings/wallet");
  const database = await db();
  const [wallet, view, current, keys] = await Promise.all([walletView(database, user.id), policyView(database, user.id), getCurrentPolicy(database, user.id), listAgentKeys(database, user.id)]);
  const env = getEnv();
  const paypal = getPayPal();
  return (
    <div className="flex flex-wrap items-start gap-6">
      <SettingsNav current="wallet" />
      <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-5">
        <div>
          <h1 className="font-display text-[26px] font-extrabold md:text-[32px]">Let an agent shop for you, within limits you set</h1>
          <p className="mt-1 max-w-[640px] text-sm text-ink-2">Three steps, once. The agent never sees your PayPal wallet: it only gets an AgentShelf key, and deterministic code checks every purchase against these rules before PayPal is called.</p>
        </div>
        {sp.saved && <div className="rounded-xl bg-ok-soft p-3 text-sm text-ok">PayPal wallet saved. Agent purchases within your rules will be paid automatically.</div>}
        {sp.error && <div className="rounded-xl bg-danger-soft p-3 text-sm text-danger">{sp.error}</div>}
        {sp.cancelled && <div className="rounded-xl bg-warn-soft p-3 text-sm text-warn">PayPal approval cancelled.</div>}

        <section className="card flex flex-col gap-4 p-5">
          <StepHeading n="1" title="Spending rules" badge={current ? <span className="badge-ok">Saved · v{current.version}</span> : <span className="badge-muted">Not set</span>} />
          <MandateEditor providers={availableAiProviders()} current={current ? { policy: current.policy, version: current.version } : null} view={view} homeLabel={current?.policy.home_geo?.label ?? null} />
        </section>

        <section className="card flex flex-col gap-3.5 p-5">
          <StepHeading n="2" title="Saved PayPal wallet" badge={wallet.status === "ACTIVE" ? <span className="badge-ok">Active</span> : <span className="badge-muted">{wallet.status === "DELETED" ? "Removed" : "Not saved"}</span>} />
          <WalletPanel wallet={wallet} paypalMode={paypal?.mode ?? "none"} />
        </section>

        <section className="card flex flex-col gap-3.5 p-5">
          <StepHeading n="3" title="Connect your agent" />
          <AgentKeysPanel keys={keys.map((k) => ({ id: k.id, label: k.label, prefix: k.keyPrefix, created_at: k.createdAt.toISOString(), last_used_at: k.lastUsedAt?.toISOString() ?? null, revoked_at: k.revokedAt?.toISOString() ?? null }))} mcpUrl={`${env.APP_URL}/mcp`} />
        </section>
      </div>
    </div>
  );
}
