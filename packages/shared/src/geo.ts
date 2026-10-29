/** Small geo helpers. Locations are approximate (rounded to ~1 km) and never exact addresses. */
import type { GeoPoint } from "./schemas/policy";

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
function toRad(d: number) {
  return (d * Math.PI) / 180;
}

/** Round to 2 decimals (~1.1 km) so a stored point never reveals an exact address. */
export function roundGeo(p: { lat: number; lng: number }): { lat: number; lng: number } {
  return { lat: Math.round(p.lat * 100) / 100, lng: Math.round(p.lng * 100) / 100 };
}

/** Parse "40.67,-73.98" into a point. */
export function parseLatLng(s: string): GeoPoint | null {
  const m = s.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export function isUsZip(s: string): boolean {
  return /^\d{5}$/.test(s.trim());
}
