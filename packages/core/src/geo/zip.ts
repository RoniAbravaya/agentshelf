import { parseLatLng, roundGeo, type GeoPoint } from "@agentshelf/shared";

/**
 * ZIP -> approximate location. Tries a small built-in table of common prefixes
 * first (works offline for the seeded demo), then the free zippopotam.us API.
 * Results are rounded to ~1 km; AgentShelf never stores exact addresses as geo.
 */
const BUILTIN: Record<string, { lat: number; lng: number; label: string }> = {
  // New York City and surroundings
  "100": { lat: 40.75, lng: -73.99, label: "Manhattan, NY" },
  "101": { lat: 40.75, lng: -73.99, label: "Manhattan, NY" },
  "102": { lat: 40.75, lng: -73.99, label: "Manhattan, NY" },
  "103": { lat: 40.58, lng: -74.15, label: "Staten Island, NY" },
  "104": { lat: 40.85, lng: -73.87, label: "Bronx, NY" },
  "110": { lat: 40.76, lng: -73.83, label: "Queens, NY" },
  "111": { lat: 40.75, lng: -73.92, label: "Queens, NY" },
  "112": { lat: 40.65, lng: -73.95, label: "Brooklyn, NY" },
  "113": { lat: 40.71, lng: -73.80, label: "Queens, NY" },
  "114": { lat: 40.68, lng: -73.78, label: "Queens, NY" },
  "116": { lat: 40.60, lng: -73.80, label: "Queens, NY" },
  "070": { lat: 40.73, lng: -74.07, label: "Jersey City, NJ" },
  "071": { lat: 40.74, lng: -74.17, label: "Newark, NJ" },
  "105": { lat: 41.03, lng: -73.77, label: "Westchester, NY" },
  "117": { lat: 40.80, lng: -73.30, label: "Long Island, NY" },
  // Other metros
  "021": { lat: 42.36, lng: -71.06, label: "Boston, MA" },
  "022": { lat: 42.36, lng: -71.06, label: "Boston, MA" },
  "191": { lat: 39.95, lng: -75.17, label: "Philadelphia, PA" },
  "200": { lat: 38.90, lng: -77.04, label: "Washington, DC" },
  "300": { lat: 33.75, lng: -84.39, label: "Atlanta, GA" },
  "303": { lat: 33.75, lng: -84.39, label: "Atlanta, GA" },
  "331": { lat: 25.77, lng: -80.19, label: "Miami, FL" },
  "606": { lat: 41.88, lng: -87.63, label: "Chicago, IL" },
  "750": { lat: 32.78, lng: -96.80, label: "Dallas, TX" },
  "770": { lat: 29.76, lng: -95.37, label: "Houston, TX" },
  "787": { lat: 30.27, lng: -97.74, label: "Austin, TX" },
  "802": { lat: 39.74, lng: -104.99, label: "Denver, CO" },
  "850": { lat: 33.45, lng: -112.07, label: "Phoenix, AZ" },
  "891": { lat: 36.17, lng: -115.14, label: "Las Vegas, NV" },
  "900": { lat: 34.05, lng: -118.24, label: "Los Angeles, CA" },
  "902": { lat: 33.95, lng: -118.40, label: "Los Angeles, CA" },
  "921": { lat: 32.72, lng: -117.16, label: "San Diego, CA" },
  "941": { lat: 37.77, lng: -122.42, label: "San Francisco, CA" },
  "945": { lat: 37.80, lng: -122.27, label: "Oakland, CA" },
  "950": { lat: 37.34, lng: -121.89, label: "San Jose, CA" },
  "972": { lat: 45.52, lng: -122.68, label: "Portland, OR" },
  "981": { lat: 47.61, lng: -122.33, label: "Seattle, WA" },
  "551": { lat: 44.98, lng: -93.27, label: "Minneapolis, MN" },
  "482": { lat: 42.33, lng: -83.05, label: "Detroit, MI" },
  "372": { lat: 36.16, lng: -86.78, label: "Nashville, TN" },
  "282": { lat: 35.23, lng: -80.84, label: "Charlotte, NC" },
};

const cache = new Map<string, GeoPoint | null>();

export async function geocodeZip(zip: string): Promise<GeoPoint | null> {
  const z = zip.trim();
  if (!/^\d{5}$/.test(z)) return null;
  if (cache.has(z)) return cache.get(z)!;
  let point: GeoPoint | null = null;
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 2500);
    const res = await fetch(`https://api.zippopotam.us/us/${z}`, { signal: ac.signal });
    clearTimeout(timer);
    if (res.ok) {
      const body = (await res.json()) as { places?: Array<{ latitude: string; longitude: string; "place name": string; "state abbreviation": string }> };
      const p = body.places?.[0];
      if (p) {
        point = { ...roundGeo({ lat: Number(p.latitude), lng: Number(p.longitude) }), label: `${p["place name"]}, ${p["state abbreviation"]}` };
      }
    }
  } catch {
    // offline or blocked: fall through to the built-in table
  }
  if (!point) {
    const b = BUILTIN[z.slice(0, 3)];
    if (b) point = { lat: b.lat, lng: b.lng, label: b.label };
  }
  cache.set(z, point);
  return point;
}

/** Accepts a ZIP or "lat,lng". */
export async function resolveNear(input: string | undefined | null): Promise<GeoPoint | null> {
  if (!input) return null;
  const ll = parseLatLng(input);
  if (ll) return roundGeo(ll);
  return geocodeZip(input);
}
