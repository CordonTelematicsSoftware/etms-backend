/**
 * Parses commute time string format like "1 hour 23 mins" to minutes
 * @param commuteTime - Time string in format "X hour Y mins" or "X mins"
 * @returns Total minutes as number
 */
export function parseCommuteTimeToMinutes(commuteTime: string): number {
  if (!commuteTime || typeof commuteTime !== 'string') {
    return 0;
  }

  let totalMinutes = 0;
  const timeStr = commuteTime.toLowerCase().trim();

  // Extract hours
  const hourMatch = timeStr.match(/(\d+)\s*hour/);
  if (hourMatch) {
    totalMinutes += parseInt(hourMatch[1]) * 60;
  }

  // Extract minutes
  const minMatch = timeStr.match(/(\d+)\s*min/);
  if (minMatch) {
    totalMinutes += parseInt(minMatch[1]);
  }

  return totalMinutes;
}
