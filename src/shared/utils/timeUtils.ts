// src/shared/utils/timeUtils.ts

/**
 * Normalizes time format to remove leading zeros from hours
 * Converts "09:00" to "9:00", "08:30" to "8:30", etc.
 * Leaves "10:00+" unchanged as they're already correct
 *
 * @param time - Time string in "HH:MM" or "H:MM" format
 * @returns Normalized time string with single digit hours
 */
export function normalizeTimeFormat(time: string): string {
  if (!time || typeof time !== 'string') {
    return time;
  }

  // Split by colon
  const [hour, minute] = time.split(':');

  if (!hour || !minute) {
    return time; // Return original if invalid format
  }

  // Remove leading zero from hour and reconstruct
  const normalizedHour = parseInt(hour, 10).toString();
  return `${normalizedHour}:${minute}`;
}

/**
 * Normalizes multiple time formats in an object
 * Useful for normalizing query parameters
 */
export function normalizeTimeFields(obj: any, timeFields: string[]): any {
  const normalized = { ...obj };

  timeFields.forEach((field) => {
    if (normalized[field]) {
      normalized[field] = normalizeTimeFormat(normalized[field]);
    }
  });

  return normalized;
}

export function normalizeTime(input) {
  // Split hours and minutes
  let [hours, minutes] = input.split(':');

  // Ensure hours and minutes are always 2 digits
  hours = hours.padStart(2, '0');
  minutes = minutes.padStart(2, '0');

  return `${hours}:${minutes}`;
}

// Usage examples:
// normalizeTimeFormat("09:00") => "9:00"
// normalizeTimeFormat("08:30") => "8:30"
// normalizeTimeFormat("10:00") => "10:00"
// normalizeTimeFormat("9:00") => "9:00" (already normalized)
