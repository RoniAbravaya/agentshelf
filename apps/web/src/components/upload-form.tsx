"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Provider = { id: "anthropic" | "openai" | "stub"; label: string; model: string };

const STEPS = ["Identifying the item", "Reading condition from photos", "Writing title and description", "Listing specs", "Checking similar prices", "Suggesting shipping cost"];

export function UploadForm({ providers, defaultZip }: { providers: Provider[]; defaultZip?: string }) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [note, setNote] = useState("");
  const [zip, setZip] = useState(defaultZip ?? "");
  const [provider, setProvider] = useState<Provider["id"]>(providers[0]?.id ?? "stub");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  function addFiles(list: FileList | null) {
    if (!list) return;
    setFiles([...files, ...Array.from(list)].slice(0, 4));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (files.length === 0) return setError("Add at least one photo.");
    setBusy(true);
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 1200);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("photos", f));
      fd.append("note", note);
      fd.append("zip", zip);
      fd.append("provider", provider);
      const res = await fetch("/api/listings/draft", { method: "POST", body: fd });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to create draft");
      router.push(`/sell/${body.listing.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    } finally {
      clearInterval(timer);
    }
  }

  if (busy) {
    return (
      <div className="card flex flex-col gap-3 p-6">
        <h2 className="font-display text-lg font-extrabold">Writing your listing…</h2>
        <p className="text-sm text-muted">Usually takes about 5–15 seconds.</p>
        <ul className="space-y-1.5 text-sm">
          {STEPS.map((s, i) => (
            <li key={s} className={`flex items-center gap-2 ${i <= step ? "text-ink" : "text-muted"}`}>
              <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${i < step ? "bg-ok-soft text-ok" : i === step ? "bg-violet-soft text-violet" : "bg-surface-2 text-muted"}`}>{i < step ? "✓" : i === step ? "…" : "○"}</span>
              {s}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card flex flex-col gap-5 p-5">
      <div>
        <span className="label">Photos (1–4)</span>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {files.map((f, i) => (
            <div key={i} className="relative aspect-square overflow-hidden rounded-2xl bg-surface-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={URL.createObjectURL(f)} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
              {i === 0 && <span className="absolute bottom-2 left-2 rounded-md bg-ink/75 px-2 py-0.5 text-[11px] font-semibold text-white">Cover</span>}
              <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-ink/75 text-lg text-white" aria-label="Remove photo">
                ×
              </button>
            </div>
          ))}
          {files.length < 4 && (
            <>
              <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-line-2 bg-white text-sm font-semibold text-ink-2 hover:border-accent hover:text-accent">
                <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 8h16v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
                  <path d="M9 8V6a3 3 0 0 1 6 0v2" />
                  <circle cx="12" cy="14" r="3" />
                </svg>
                Take photo
                <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" capture="environment" className="hidden" onChange={(e) => addFiles(e.target.files)} />
              </label>
              <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-line-2 bg-white text-sm font-semibold text-ink-2 hover:border-accent hover:text-accent">
                <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <circle cx="9" cy="10" r="2" />
                  <path d="M21 15l-5-5-8 8" />
                </svg>
                From gallery
                <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
              </label>
            </>
          )}
        </div>
        <p className="mt-1.5 text-xs text-muted">JPG, PNG or WebP, max 10 MB each. The first photo is the cover.</p>
      </div>
      <div>
        <label className="label" htmlFor="note">
          Note for the AI (optional)
        </label>
        <input id="note" className="input" placeholder="works, small scratch on top plate, includes strap" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="zip">
            Your ZIP code
          </label>
          <input id="zip" className="input" placeholder="11215" value={zip} onChange={(e) => setZip(e.target.value)} pattern="\d{5}" inputMode="numeric" />
          <p className="mt-1 text-xs text-muted">For the shipping estimate and pickup area.</p>
        </div>
        <div>
          <label className="label" htmlFor="provider">
            Listing AI
          </label>
          <select id="provider" className="input" value={provider} onChange={(e) => setProvider(e.target.value as Provider["id"])}>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} ({p.model})
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      <button className="btn-primary w-full min-h-12 text-base" type="submit">
        Next: let AI write it
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </button>
    </form>
  );
}
