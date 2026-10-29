"use client";

import { useState } from "react";

export function Gallery({ photos, title }: { photos: string[]; title: string }) {
  const [i, setI] = useState(0);
  if (photos.length === 0) return <div className="card flex aspect-[4/3] items-center justify-center text-muted">No photos</div>;
  return (
    <div className="flex flex-col gap-2.5">
      <div className="relative aspect-[4/3] overflow-hidden rounded-[18px] bg-surface-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photos[i]} alt={`${title} photo ${i + 1}`} className="h-full w-full object-contain" />
        <span className="absolute bottom-3 right-3 rounded-lg bg-ink/75 px-2.5 py-1 text-xs text-white">
          Photo {i + 1} of {photos.length}
          {photos.length > 1 ? " · swipe" : ""}
        </span>
      </div>
      {photos.length > 1 && (
        <div className="grid grid-cols-4 gap-2.5">
          {photos.map((p, j) => (
            <button key={p} type="button" onClick={() => setI(j)} aria-label={`Show photo ${j + 1}`} className={`aspect-[4/3] overflow-hidden rounded-[10px] border-2 bg-surface-2 ${j === i ? "border-accent" : "border-transparent"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
