import * as moment from 'moment';

/**
 * The hourly cutoff grammar: 'hourly,<lower>,<upper>', both in HOURS.
 *
 * Enforced at trip-request.service.ts:5442-5483. Allowed iff
 * lower <= hoursUntil(shift) <= upper, so:
 *
 *   window opens  at shift - upper
 *   window closes at shift - lower   <- the deadline
 *
 * Both bounds are skipped when falsy, because the enforcement reads
 * `if (lowerCutoff && ...)`. A lower of 0 therefore means "no deadline", and
 * with no deadline there is nothing to remind about.
 */
export interface HourlyCutoff {
  ok: true;
  lower: number;
  upper: number | null;
}

export interface HourlyCutoffError {
  ok: false;
  reason: string;
}

export type HourlyCutoffResult = HourlyCutoff | HourlyCutoffError;

/** How far ahead the schedule is generated. */
export const SCHEDULE_HORIZON_DAYS = 7;

export function parseHourlyCutoff(raw: unknown): HourlyCutoffResult {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return { ok: false, reason: 'empty cutoff config' };
  }

  const parts = raw.split(',').map((part) => part.trim().toLowerCase());
  if (parts[0] !== 'hourly') {
    return { ok: false, reason: `not an hourly cutoff ("${parts[0]}")` };
  }

  if (parts.length < 3) {
    // 'hourly,2' leaves parts[2] undefined, and Number(undefined) is NaN, which
    // falls through the !Number.isFinite(upper) branch below and resolves to
    // upper: null — "no upper bound". That is not what a truncated config
    // means, and it makes every day in the horizon due at once.
    return {
      ok: false,
      reason: `expected "hourly,<lower>,<upper>", got "${raw.trim()}"`,
    };
  }

  const lower = Number(parts[1]);
  const upper = Number(parts[2]);

  if (!Number.isFinite(lower) || lower < 0) {
    return { ok: false, reason: `invalid lower cutoff "${parts[1]}"` };
  }

  if (!lower) {
    // Matches the booking-side `if (lowerCutoff && ...)` guard: 0 disables the
    // bound, so no deadline exists and a reminder would have nothing to point
    // at. Live UAT data is 'hourly,0,43200' for several orgs, which is why this
    // is a named skip rather than an error.
    return {
      ok: false,
      reason: 'lower cutoff is 0 — no deadline to remind on',
    };
  }

  if (!Number.isFinite(upper) || upper <= 0) {
    // Upper disabled: the window has no opening edge, so it is open as soon as
    // the trip exists. Remind at the horizon edge instead.
    return { ok: true, lower, upper: null };
  }

  if (upper < lower) {
    return {
      ok: false,
      reason: `upper cutoff ${upper} is below lower cutoff ${lower} — nothing is bookable`,
    };
  }

  return { ok: true, lower, upper };
}

/**
 * Shift instant for a date and an 'HH:mm' shift time.
 *
 * '24:00' is live data (org 1 has it in both Login time and Logout time), and
 * moment would reject it, so it is folded to 00:00 on the following day.
 */
export function shiftInstant(
  tripDate: string,
  shiftTime: string,
): moment.Moment | null {
  const [hourRaw, minuteRaw] = shiftTime.split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);

  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    return null;
  }

  const base = moment(tripDate, 'YYYY-MM-DD', true);
  if (!base.isValid()) {
    return null;
  }

  if (hour === 24) {
    return base.add(1, 'day').set({
      hour: 0,
      minute,
      second: 0,
      millisecond: 0,
    });
  }

  return base.set({ hour, minute, second: 0, millisecond: 0 });
}

/**
 * SCHEDULE_REMINDER_BUFFER: how long before the deadline the nudge lands.
 *
 * MINUTES, always. Deliberately not the "<number>,<unit>" grammar that
 * SCHEDULE_REMINDER_LEAD uses — a bare `12` there could be read as 12 hours by
 * an admin who meant minutes, and this value sits close enough to the deadline
 * that the difference decides whether the push is useful or useless.
 */
export const DEFAULT_BUFFER_MINUTES = 20;
export const MIN_BUFFER_MINUTES = 1;
export const MAX_BUFFER_MINUTES = 180;

/**
 * Never throws, and never suppresses the reminder: a bad buffer degrades to the
 * default, because the alternative is silencing an org over a typo in a value
 * that only shifts the push by minutes.
 *
 * An absent config row resolves to the default SILENTLY — no ConfigurationMasters
 * row is seeded for this key, so "missing" is the normal state today and warning
 * about it would fire for every org on every rebuild.
 */
export function parseReminderBuffer(raw: unknown): {
  minutes: number;
  reason?: string;
} {
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    return { minutes: DEFAULT_BUFFER_MINUTES };
  }

  const trimmed = String(raw).trim();
  const value = Number(trimmed);

  if (!Number.isInteger(value)) {
    return {
      minutes: DEFAULT_BUFFER_MINUTES,
      reason: `SCHEDULE_REMINDER_BUFFER "${trimmed}" is not an integer number of minutes — using ${DEFAULT_BUFFER_MINUTES}`,
    };
  }

  if (value < MIN_BUFFER_MINUTES || value > MAX_BUFFER_MINUTES) {
    return {
      minutes: DEFAULT_BUFFER_MINUTES,
      reason: `SCHEDULE_REMINDER_BUFFER ${value} is outside ${MIN_BUFFER_MINUTES}-${MAX_BUFFER_MINUTES} minutes — using ${DEFAULT_BUFFER_MINUTES}`,
    };
  }

  return { minutes: value };
}

export interface HourlyWindow {
  /** shift - upper: when booking opens. Bounds runAt, does not define it. */
  opensAt: moment.Moment;
  /** shift - lower: the deadline. */
  closesAt: moment.Moment;
  /** When the push should land: closesAt - buffer, never before opensAt. */
  runAt: moment.Moment;
  shiftAt: moment.Moment;
}

export function computeHourlyWindow(
  tripDate: string,
  shiftTime: string,
  cutoff: HourlyCutoff,
  bufferMinutes: number = DEFAULT_BUFFER_MINUTES,
): HourlyWindow | null {
  const shiftAt = shiftInstant(tripDate, shiftTime);
  if (!shiftAt) {
    return null;
  }

  const closesAt = shiftAt.clone().subtract(cutoff.lower, 'hours');
  const opensAt =
    cutoff.upper === null
      ? // No opening edge configured. Anchoring to the horizon put opensAt in
        // the past for every day in it, so the generator's already-open branch
        // set runAt = now and the whole horizon became due on one tick. A fixed
        // lead off the deadline keeps one reminder per day at a useful time.
        closesAt.clone().subtract(24, 'hours')
      : shiftAt.clone().subtract(cutoff.upper, 'hours');

  // The nudge belongs shortly before the DEADLINE, not at the moment booking
  // opens. `upper` is a permission bound — live orgs run 192, 720 and 43200
  // hours — so anchoring the reminder to it put opensAt far outside the 7-day
  // generation horizon, every day in the horizon then clamped to `now`, and the
  // employee was reminded about all of them at once.
  //
  // `upper` keeps its other two jobs: rejecting an inverted window in
  // parseHourlyCutoff, and defining opensAt for the clamp below.
  const target = closesAt.clone().subtract(bufferMinutes, 'minutes');

  // Clamped to opensAt on purpose. When the buffer is wider than the window
  // ('hourly,2,3' is one hour wide, buffer 90), closesAt - buffer lands before
  // booking is permitted, and an employee must never be nudged earlier than
  // they can act on it.
  const runAt = moment.max(target, opensAt);

  return { opensAt, closesAt, runAt, shiftAt };
}
