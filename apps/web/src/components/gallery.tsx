"use client";

import { useState } from "react";

export function Gallery({ photos, title }: { photos: string[]; title: string }) {
  const [i, setI] = useState(0);
  if (photos.length === 0) return <div className="card flex aspect-[4/3] items-center justify-center text-slate-400">No photos</div>;
  return (
    <div className="card overflow-hidden">
      <div className="relative aspect-[4/3] bg-slate-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photos[i]} alt={`${title} photo ${i + 1}`} className="h-full w-full object-contain" />
        <span className="absolute bottom-2 right-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
          Photo {i + 1} of {photos.length}
        </span>
      </div>
      {photos.length > 1 && (
        <div className="flex gap-2 p-2">
          {photos.map((p, j) => (
            <button key={p} type="button" onClick={() => setI(j)} className={`h-16 w-16 overflow-hidden rounded-md border-2 ${j === i ? "border-brand" : "border-transparent"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
