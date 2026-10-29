"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ListingRowActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function act(action: string) {
    if (action === "delete" && !confirm("Delete this listing permanently?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/listings/${id}/${action}`, { method: "POST" });
      if (!res.ok) alert((await res.json()).error ?? "Failed");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex shrink-0 flex-wrap gap-1.5">
      {status === "DRAFT" && (
        <Link className="btn-secondary btn-sm" href={`/sell/${id}`}>
          Continue
        </Link>
      )}
      {status !== "SOLD" && status !== "RESERVED" && status !== "DRAFT" && (
        <Link className="btn-secondary btn-sm" href={`/sell/${id}`}>
          Edit
        </Link>
      )}
      {status === "AVAILABLE" && (
        <>
          <button className="btn-secondary btn-sm" disabled={busy} onClick={() => act("pause")}>
            Pause
          </button>
          <button className="btn-secondary btn-sm" disabled={busy} onClick={() => act("mark-sold")}>
            Sold elsewhere
          </button>
        </>
      )}
      {status === "PAUSED" && (
        <button className="btn-secondary btn-sm" disabled={busy} onClick={() => act("resume")}>
          Resume
        </button>
      )}
      {status === "SOLD" && (
        <button className="btn-secondary btn-sm" disabled={busy} onClick={() => act("relist")}>
          Relist
        </button>
      )}
      {status !== "RESERVED" && (
        <button className="btn-danger btn-sm" disabled={busy} onClick={() => act("delete")}>
          Delete
        </button>
      )}
    </div>
  );
}
