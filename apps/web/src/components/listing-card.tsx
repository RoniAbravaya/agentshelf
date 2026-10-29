import Link from "next/link";
import { conditionLabel, formatUsd, type ListingCard as Card } from "@agentshelf/shared";

export function ListingCard({ card }: { card: Card }) {
  return (
    <Link href={`/listings/${card.listing_id}`} className="card group overflow-hidden transition hover:shadow-md">
      <div className="aspect-[4/3] w-full overflow-hidden bg-slate-100">
        {card.cover_photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.cover_photo_url} alt={card.title} className="h-full w-full object-cover transition group-hover:scale-[1.02]" loading="lazy" />
        ) : (
          <div className="flex h-full items-center justify-center text-slate-400">No photo</div>
        )}
      </div>
      <div className="space-y-1 p-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 text-sm font-semibold text-slate-900">{card.title}</h3>
          <span className="shrink-0 text-sm font-bold">{formatUsd(card.price_cents)}</span>
        </div>
        <div className="text-xs text-slate-500">
          {conditionLabel(card.condition)} · {card.area}
          {card.distance_km != null ? ` · ~${Math.round(card.distance_km)} km` : ""}
        </div>
        <div className="text-xs text-slate-500">
          {card.pickup ? "Pickup" : ""}
          {card.pickup && card.shipping.available ? " · " : ""}
          {card.shipping.available ? `Ships ${formatUsd(card.shipping.cost_cents ?? 0)}` : ""}
        </div>
        <div className="flex items-center gap-1 text-xs text-slate-600">
          <span className="font-medium">{card.seller.display_name}</span>
          {card.seller.rating != null ? (
            <span>
              · {card.seller.rating.toFixed(1)}★ ({card.seller.review_count})
            </span>
          ) : (
            <span>· New seller</span>
          )}
        </div>
      </div>
    </Link>
  );
}
