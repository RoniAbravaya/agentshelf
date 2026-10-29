import { z } from "zod";
import { handler, json, parseBody } from "@/lib/api";

export const dynamic = "force-dynamic";

const Input = z.object({
  category: z.string().optional(),
  size_class: z.enum(["SMALL", "MEDIUM", "LARGE", "FREIGHT"]).optional(),
  weight_kg: z.number().positive().optional(),
});

const BY_CATEGORY: Record<string, { size: "SMALL" | "MEDIUM" | "LARGE" | "FREIGHT"; cents: number }> = {
  cameras: { size: "SMALL", cents: 900 },
  phones: { size: "SMALL", cents: 800 },
  audio: { size: "MEDIUM", cents: 1200 },
  computers: { size: "MEDIUM", cents: 1500 },
  electronics: { size: "MEDIUM", cents: 1200 },
  video_games: { size: "SMALL", cents: 900 },
  books: { size: "SMALL", cents: 600 },
  movies: { size: "SMALL", cents: 600 },
  music: { size: "MEDIUM", cents: 1500 },
  clothing: { size: "SMALL", cents: 700 },
  shoes: { size: "SMALL", cents: 900 },
  accessories: { size: "SMALL", cents: 700 },
  jewelry: { size: "SMALL", cents: 600 },
  toys: { size: "MEDIUM", cents: 1000 },
  baby: { size: "MEDIUM", cents: 1200 },
  kitchen: { size: "MEDIUM", cents: 1800 },
  home: { size: "MEDIUM", cents: 1500 },
  tools: { size: "MEDIUM", cents: 1200 },
  sports: { size: "MEDIUM", cents: 1200 },
  outdoors: { size: "LARGE", cents: 2200 },
  art: { size: "MEDIUM", cents: 1500 },
  collectibles: { size: "SMALL", cents: 900 },
  garden: { size: "LARGE", cents: 2500 },
  pets: { size: "MEDIUM", cents: 1200 },
  furniture: { size: "FREIGHT", cents: 0 },
  bikes: { size: "FREIGHT", cents: 0 },
  other: { size: "MEDIUM", cents: 1200 },
};
const BY_SIZE = { SMALL: 800, MEDIUM: 1400, LARGE: 2800, FREIGHT: 0 } as const;

/** Deterministic shipping suggestion by size class / category (the vision draft already carries an AI estimate). */
export const POST = handler(async (req) => {
  const input = await parseBody(req, Input);
  const base = input.category ? BY_CATEGORY[input.category] : undefined;
  const size = input.size_class ?? base?.size ?? "MEDIUM";
  let cents = input.size_class ? BY_SIZE[input.size_class] : (base?.cents ?? BY_SIZE[size]);
  if (input.weight_kg && size !== "FREIGHT") cents += Math.round(Math.max(0, input.weight_kg - 1) * 250);
  return json({ size_class: size, suggested_shipping_cents: cents, pickup_only: size === "FREIGHT", note: size === "FREIGHT" ? "Too large for a flat parcel rate; offer local pickup." : "Flat US domestic estimate; the seller sets the final cost." });
});
