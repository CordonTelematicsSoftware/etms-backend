export interface LatLng {
  lat: number;
  lng: number;
}

// Parses Organization.geoCode, stored as "lat,lng" (see Organization model).
export function parseGeoCode(
  geoCode: string | null | undefined,
): LatLng | null {
  if (!geoCode) return null;
  const parts = geoCode.split(',').map((p) => parseFloat(p.trim()));
  if (parts.length !== 2 || parts.some((n) => Number.isNaN(n))) return null;
  const [lat, lng] = parts;
  return { lat, lng };
}

// Parses raw lat/lng strings as returned by CordonBatchPoint (latitude/longitude
// are separate optional string fields there, unlike geoCode's combined format).
export function parseLatLngStrings(
  latitude: string | null | undefined,
  longitude: string | null | undefined,
): LatLng | null {
  if (!latitude || !longitude) return null;
  const lat = parseFloat(latitude);
  const lng = parseFloat(longitude);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return { lat, lng };
}

const EARTH_RADIUS_KM = 6371;

export function haversineDistanceKm(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const h =
    sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;

  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return EARTH_RADIUS_KM * c;
}
