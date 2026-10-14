/**
 * Parses a buffer config string (e.g. "7:10,14:15,21:20,21+:25") into an
 * array of { upperBound, minutes } objects.
 *
 * Format: "upperBound:minutes,..." where the last entry's key carries a "+"
 * suffix to signal it is open-ended (e.g. "21+:25" means > 21 km → 25 min).
 *
 * Returns an empty array if the raw string is null, empty, or unparseable.
 */
export function parseBufferConfig(
  raw: string,
): { upperBound: number; minutes: number }[] {
  if (!raw) return [];
  // console.log("bufferUtils: parseBufferConfig: ", raw);
  const pairs = raw
    .split(',')
    .map((pair) => pair.trim())
    .filter(Boolean);

  const bands: { upperBound: number; minutes: number }[] = [];

  for (const pair of pairs) {
    const [boundStr, minutesStr] = pair.split(':');
    if (!boundStr || !minutesStr) continue;

    // Strip "+" suffix from open-ended last band (e.g. "21+")
    const upperBound = Number(boundStr.trim().replace('+', ''));
    const minutes = Number(minutesStr.trim());

    if (isNaN(upperBound) || isNaN(minutes)) continue;

    bands.push({ upperBound, minutes });
  }
  //   console.log("bufferUtils: parseBufferConfig:return bands: ", bands);
  return bands;
}

/**
 * Given a parsed bands array and a trip's total distance in km, returns
 * the buffer minutes to apply.
 *
 * Semantics: bands are checked in order; the first band whose upperBound
 * is >= totalKm is used. The last band is always open-ended — if totalKm
 * exceeds all upper bounds, the last band's minutes are returned.
 *
 * Returns 0 if the bands array is empty (safe fallback).
 */
export function getBufferForDistance(
  bands: { upperBound: number; minutes: number }[],
  totalKm: number,
): number {
  if (!bands || bands.length === 0) return 0;
  // console.log("bufferUtils: getBufferForDistance: bands ", bands);
  // console.log("bufferUtils: getBufferForDistance: totalKm ", totalKm);
  const distance = Number(totalKm);

  for (const band of bands) {
    if (distance <= band.upperBound) {
      return band.minutes;
    }
  }
  //   console.log("bufferUtils: getBufferForDistance: bands.minutes: ", bands[bands.length - 1].minutes)
  // totalKm exceeds all upper bounds — use the last band (open-ended)
  return bands[bands.length - 1].minutes;
}
