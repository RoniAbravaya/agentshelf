import type { Metadata } from "next";
import { Inter, Manrope } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { MobileTabs } from "@/components/mobile-tabs";
import { SiteHeader } from "@/components/site-header";
import { currentSession } from "@/lib/auth";
import { getEnv, getPayPal } from "@agentshelf/core";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const manrope = Manrope({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-manrope", display: "swap" });

export const metadata: Metadata = {
  title: { default: "AgentShelf", template: "%s | AgentShelf" },
  description: "Sell anything to people and AI agents, paid through PayPal.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await currentSession();
  const paypal = getPayPal();
  const env = getEnv();
  return (
    <html lang="en" className={`${inter.variable} ${manrope.variable}`}>
      <body className="min-h-screen font-sans">
        <SiteHeader signedIn={Boolean(session)} name={session?.name ?? null} />
        {paypal?.mode === "mock" && (
          <div className="bg-warn-soft text-center text-xs text-warn">
            <div className="mx-auto max-w-6xl px-4 py-1.5">
              PayPal sandbox credentials are not configured: payments are <strong>simulated</strong> locally. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env for real sandbox checkout.
            </div>
          </div>
        )}
        {!paypal && (
          <div className="bg-danger-soft text-center text-xs text-danger">
            <div className="mx-auto max-w-6xl px-4 py-1.5">PayPal is not configured. Checkout is disabled.</div>
          </div>
        )}
        <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6 md:pb-10">{children}</main>
        <footer className="hidden border-t border-line md:block">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5 text-xs text-muted">
            <span>AgentShelf · PayPal AI Hackathon 2026 · Sandbox only</span>
            <span className="flex flex-wrap gap-4">
              <Link href="/feed.json" className="hover:text-ink">
                Product feed
              </Link>
              <Link href="/agent" className="hover:text-ink">
                Demo agent
              </Link>
              <span>
                MCP: <code className="mono">{env.APP_URL}/mcp</code>
              </span>
            </span>
          </div>
        </footer>
        <MobileTabs signedIn={Boolean(session)} />
      </body>
    </html>
  );
}
