"use client";

import { useEffect, useState } from "react";

type Msg = { id: string; sender: string; body: string; created_at: string };

export function ChatThread({ conversationId, role, initial }: { conversationId: string; role: "buyer" | "seller"; initial: Msg[] }) {
  const [messages, setMessages] = useState<Msg[]>(initial);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const res = await fetch(`/api/conversations/${conversationId}/messages`);
        if (res.ok) {
          const data = await res.json();
          setMessages((data.messages as Array<{ id: string; sender: string; body: string; createdAt: string }>).map((m) => ({ id: m.id, sender: m.sender, body: m.body, created_at: m.createdAt })).reverse());
        }
      } catch {
        /* ignore */
      }
    }, 5000);
    return () => clearInterval(t);
  }, [conversationId]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not send");
      setMessages([...messages, { id: data.message.id, sender: data.message.sender, body: data.message.body, created_at: data.message.createdAt }]);
      setText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const mine = (m: Msg) => (role === "seller" ? m.sender === "seller" : m.sender !== "seller");
  return (
    <div className="card flex flex-col">
      <div className="max-h-[60vh] space-y-2 overflow-y-auto p-4">
        {messages.length === 0 && <p className="text-center text-sm text-slate-400">No messages yet.</p>}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${mine(m) ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${mine(m) ? "bg-brand text-white" : "bg-slate-100 text-slate-900"}`}>
              <div className="mb-0.5 text-[10px] uppercase tracking-wide opacity-70">
                {m.sender === "buyer_agent" ? "Buyer's AI agent" : m.sender === "seller" ? "Seller" : "Buyer"} · {new Date(m.created_at).toLocaleString()}
              </div>
              <div className="whitespace-pre-line">{m.body}</div>
            </div>
          </div>
        ))}
      </div>
      <form onSubmit={send} className="flex gap-2 border-t border-slate-100 p-3">
        <input className="input" placeholder="Write a message" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} />
        <button className="btn-primary" disabled={busy} type="submit">
          Send
        </button>
      </form>
      {error && <p className="px-3 pb-3 text-sm text-red-700">{error}</p>}
    </div>
  );
}
