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
    const next = [...files, ...Array.from(list)].slice(0, 4);
    setFiles(next);
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
      <div className="card space-y-3 p-6">
        <h2 className="text-lg font-semibold">Writing your listing...</h2>
        <p className="text-sm text-slate-500">Usually takes about 5-15 seconds.</p>
        <ul className="space-y-1 text-sm">
          {STEPS.map((s, i) => (
            <li key={s} className={i <= step ? "text-slate-900" : "text-slate-400"}>
              {i < step ? "✓" : i === step ? "…" : "○"} {s}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card space-y-5 p-5">
      <div>
        <span className="label">Photos (1-4)</span>
        <div className="grid grid-cols-4 gap-2">
          {files.map((f, i) => (
            <div key={i} className="relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={URL.createObjectURL(f)} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
              {i === 0 && <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[10px] text-white">Cover</span>}
              <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="absolute right-1 top-1 rounded bg-black/60 px-1.5 text-xs text-white" aria-label="Remove">
                ×
              </button>
            </div>
          ))}
          {files.length < 4 && (
            <label className="flex aspect-square cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-slate-300 text-sm text-slate-500 hover:border-brand hover:text-brand">
              + Add
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
            </label>
          )}
        </div>
        <p className="mt-1 text-xs text-slate-500">JPG, PNG or WebP, max 10 MB each. On a phone, tap Add to take a photo.</p>
      </div>
      <div>
        <label className="label" htmlFor="note">
          Optional note for the AI
        </label>
        <input id="note" className="input" placeholder='e.g. "works, small scratch on top plate, includes strap"' value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="zip">
            Your ZIP code (for the shipping estimate and pickup area)
          </label>
          <input id="zip" className="input" placeholder="11215" value={zip} onChange={(e) => setZip(e.target.value)} pattern="\d{5}" />
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
      {error && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      <button className="btn-primary w-full" type="submit">
        Next: let AI write it
      </button>
    </form>
  );
}
