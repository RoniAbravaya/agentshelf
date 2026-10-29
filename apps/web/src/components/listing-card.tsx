import Link from "next/link";
import { conditionLabel, formatUsd, type ListingCard as Card } from "@agentshelf/shared";

export function ListingCard({ card }: { card: Card }) {
  return (
    <Link href={`/listings/${card.listing_id}`} className="card group flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(11,18,32,0.08)]">
      <div className="aspect-[4/3] w-full overflow-hidden bg-surface-2">
        {card.cover_photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.cover_photo_url} alt={card.title} className="h-full w-full object-cover transition group-hover:scale-[1.02]" loading="lazy" />
        ) : (
          <div className="flex h-full items-center justify-center text-muted">No photo</div>
        )}
      </div>
      <div className="flex flex-col gap-1.5 p-3.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-ink">{card.title}</h3>
          <span className="shrink-0 text-[15px] font-bold">{formatUsd(card.price_cents)}</span>
        </div>
        <div className="text-[13px] text-ink-2">
          {conditionLabel(card.condition)} · {card.area}
          {card.distance_km != null ? ` · ${card.distance_km < 1 ? "<1" : Math.round(card.distance_km)} km` : ""}
        </div>
        <div className="text-[13px] text-ink-2">
          {card.pickup ? "Pickup free" : ""}
          {card.pickup && card.shipping.available ? " · " : ""}
          {card.shipping.available ? `Ships ${formatUsd(card.shipping.cost_cents ?? 0)}` : ""}
          {!card.pickup && !card.shipping.available ? "Contact seller" : ""}
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-[13px] text-ink">
          <span className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full bg-accent-soft text-[11px] font-bold text-accent">{card.seller.display_name.slice(0, 1)}</span>
          <span className="font-medium">{card.seller.display_name}</span>
          <span className="text-ink-2">{card.seller.rating != null ? `· ${card.seller.rating.toFixed(1)}★ (${card.seller.review_count})` : "· New seller"}</span>
        </div>
      </div>
    </Link>
  );
}
