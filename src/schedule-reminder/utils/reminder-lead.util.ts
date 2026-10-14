/**
 * Parser for the SCHEDULE_REMINDER_LEAD config value.
 *
 * Grammar (deliberately NOT the cutoff grammar — do not route cutoff strings
 * through this, or this through applyCutoffValidation):
 *
 *   "<number>,<unit>"   unit ∈ minutes | hours | days
 *   "None"              reminders disabled for the org
 *
 * e.g. "30,minutes"  "3,hours"  "2,days"  "None"
 *
 * This parser NEVER throws. Every unparseable input resolves to
 * { enabled: false } with a `reason` the caller can log, because the config is
 * free-text admin input and a bad value must not take the cron down for every
 * other org in the same run. `reason` exists so a misconfiguration is visible in
 * the logs rather than silently behaving like "None".
 */

export type ReminderLeadUnit = 'minutes' | 'hours' | 'days';

export interface ReminderLead {
  enabled: boolean;
  amount?: number;
  unit?: ReminderLeadUnit;
  /** Why the value was rejected. Absent when enabled. */
  reason?: string;
}

const UNIT_MINUTES: Record<ReminderLeadUnit, number> = {
  minutes: 1,
  hours: 60,
  days: 60 * 24,
};

/**
 * Singular forms are accepted as aliases ("1,day"). Rejecting them would
 * silently disable an org's reminders over a plausible typo, which is a worse
 * failure than being liberal here.
 */
const UNIT_ALIASES: Record<string, ReminderLeadUnit> = {
  minute: 'minutes',
  minutes: 'minutes',
  min: 'minutes',
  mins: 'minutes',
  hour: 'hours',
  hours: 'hours',
  hr: 'hours',
  hrs: 'hours',
  day: 'days',
  days: 'days',
};

/**
 * A lead longer than this is treated as a misconfiguration rather than clamped:
 * every cutoff in the horizon would fall inside the window, so every employee
 * would be reminded on every run, far too early to be useful.
 */
export const MAX_LEAD_MINUTES = 14 * 24 * 60; // 14 days

export function parseReminderLead(raw: unknown): ReminderLead {
  if (typeof raw !== 'string') {
    return { enabled: false, reason: 'not a string' };
  }

  const value = raw.trim();

  if (value === '') {
    return { enabled: false, reason: 'blank' };
  }

  if (value.toLowerCase() === 'none') {
    return { enabled: false, reason: 'None' };
  }

  const parts = value.split(',').map((part) => part.trim());

  if (parts.length !== 2) {
    return {
      enabled: false,
      reason: `expected "<number>,<unit>", got "${value}"`,
    };
  }

  const [amountRaw, unitRaw] = parts;

  // Number() rather than parseInt: parseInt("3days") === 3 would accept a
  // malformed value, and parseInt("3.5") would silently truncate.
  const amount = Number(amountRaw);

  if (!Number.isFinite(amount) || !Number.isInteger(amount)) {
    return {
      enabled: false,
      reason: `amount "${amountRaw}" is not an integer`,
    };
  }

  if (amount <= 0) {
    // 0 would make the in-play window [now, now] — empty, so nothing would ever
    // be selected. Negative is nonsense. Both are disabled, explicitly.
    return { enabled: false, reason: `amount "${amountRaw}" must be > 0` };
  }

  const unit = UNIT_ALIASES[unitRaw.toLowerCase()];

  if (!unit) {
    return {
      enabled: false,
      reason: `unit "${unitRaw}" is not one of minutes|hours|days`,
    };
  }

  const totalMinutes = amount * UNIT_MINUTES[unit];

  if (totalMinutes > MAX_LEAD_MINUTES) {
    return {
      enabled: false,
      reason: `lead ${amount} ${unit} exceeds the ${MAX_LEAD_MINUTES}-minute maximum`,
    };
  }

  return { enabled: true, amount, unit };
}

/**
 * Minutes represented by a parsed lead. 0 for a disabled lead, so callers that
 * skip on `!enabled` never see a misleading duration.
 */
export function reminderLeadToMinutes(lead: ReminderLead): number {
  if (!lead.enabled || !lead.amount || !lead.unit) {
    return 0;
  }
  return lead.amount * UNIT_MINUTES[lead.unit];
}
