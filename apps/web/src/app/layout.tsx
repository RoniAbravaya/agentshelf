import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { currentSession } from "@/lib/auth";
import { getPayPal } from "@agentshelf/core";

export const metadata: Metadata = {
  title: { default: "AgentShelf", template: "%s | AgentShelf" },
  description: "Sell anything to people and AI agents, paid through PayPal.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await currentSession();
  const paypal = getPayPal();
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 text-lg font-bold text-brand">
              <span className="inline-block h-7 w-7 rounded-md bg-brand text-center text-sm leading-7 text-accent">A</span>
              AgentShelf
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              <Link className="rounded-md px-3 py-1.5 hover:bg-slate-100" href="/">
                Browse
              </Link>
              <Link className="rounded-md px-3 py-1.5 hover:bg-slate-100" href="/agent">
                Demo agent
              </Link>
              {session ? (
                <>
                  <Link className="rounded-md px-3 py-1.5 hover:bg-slate-100" href="/sell">
                    Sell
                  </Link>
                  <Link className="rounded-md px-3 py-1.5 hover:bg-slate-100" href="/dashboard">
                    Dashboard
                  </Link>
                  <Link className="rounded-md px-3 py-1.5 hover:bg-slate-100" href="/inbox">
                    Inbox
                  </Link>
                  <Link className="rounded-md px-3 py-1.5 hover:bg-slate-100" href="/settings">
                    Settings
                  </Link>
                  <form action="/api/auth/logout" method="post">
                    <button className="rounded-md px-3 py-1.5 text-slate-500 hover:bg-slate-100" type="submit">
                      Sign out
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <Link className="rounded-md px-3 py-1.5 hover:bg-slate-100" href="/login">
                    Sign in
                  </Link>
                  <Link className="btn-primary" href="/signup">
                    Start selling
                  </Link>
                </>
              )}
            </nav>
          </div>
        </header>
        {paypal?.mode === "mock" && (
          <div className="bg-amber-50 text-center text-xs text-amber-800">
            <div className="mx-auto max-w-6xl px-4 py-1.5">
              PayPal sandbox credentials are not configured: payments are <strong>simulated</strong> locally. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env for real sandbox checkout.
            </div>
          </div>
        )}
        {!paypal && (
          <div className="bg-red-50 text-center text-xs text-red-800">
            <div className="mx-auto max-w-6xl px-4 py-1.5">PayPal is not configured. Checkout is disabled.</div>
          </div>
        )}
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        <footer className="mt-12 border-t border-slate-200 py-6 text-center text-xs text-slate-500">
          AgentShelf · PayPal AI Hackathon 2026 · Sandbox only · <Link href="/feed.json">Product feed</Link> · MCP endpoint: <code>/mcp</code>
        </footer>
      </body>
    </html>
  );
}
