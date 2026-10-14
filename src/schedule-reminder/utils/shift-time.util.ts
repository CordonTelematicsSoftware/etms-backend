import { CutoffLeg } from './cutoff-deadline.util';

/**
 * Shift times resolved for one cohort (a team, or an org's default).
 *
 * `pick` comes from Login time, `drop` from Logout time. Either may be empty,
 * which means "no reminder for that leg" — not "inherit". See resolveForTeam.
 */
export interface ResolvedShiftTimes {
  pick: string[];
  drop: string[];
  source: 'team' | 'org' | 'global' | 'none';
  /** Populated when a leg resolved to an empty list, for the sweep summary. */
  reason?: string;
}

export const SHIFT_CONFIG_LOGIN = 'Login time';
export const SHIFT_CONFIG_LOGOUT = 'Logout time';

/** Config names are matched the same fuzzy way the cutoff sweep matches them. */
export function normalizeConfigName(raw: string): string {
  return String(raw ?? '')
    .toLowerCase()
    .replace(/_/g, ' ')
    .trim();
}

/**
 * 'H:MM' or 'HH:MM' -> 'HH:MM'. Returns null for anything else.
 *
 * Both forms exist in live data: ConfigurationMasters holds '9:00' while
 * CompanyConfigurations holds '09:00'. Normalising here keeps the generated
 * schedule rows comparable across the two sources.
 */
export function normalizeClock(raw: unknown): string | null {
  if (typeof raw !== 'string') {
    return null;
  }
  const value = raw.trim();
  if (!/^\d{1,2}:\d{2}$/.test(value)) {
    return null;
  }
  const [hourRaw, minuteRaw] = value.split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  // 24 is permitted, and 24:00 is live data: org 1's Login time and Logout
  // time lists both contain it. ConfigurationService.parseTimeConfig gates on
  // /^\d{1,2}:\d{2}$/ alone, with no range check, so booking accepts 24:00 and
  // offers it in the dropdown. Rejecting it here would empty the whole list
  // (parseTimeList is all-or-nothing) and silently remove that org from
  // reminders entirely. It is normalised to the next day's 00:00 when the
  // shift instant is computed — see the generator.
  if (!Number.isInteger(hour) || hour < 0 || hour > 24) {
    return null;
  }
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
    return null;
  }
  if (hour === 24 && minute !== 0) {
    return null;
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export interface ParsedTimeList {
  times: string[];
  reason?: string;
}

/**
 * Parse a shift-time list from either storage shape.
 *
 * CompanyConfigurations.configValue is a comma-joined VARCHAR; both
 * ConfigurationMasters.configValue and Teams.shiftLoginTime are text[].
 *
 * All-or-nothing on a malformed element, deliberately: this mirrors
 * ConfigurationService.parseTimeConfig, which empties the whole list when any
 * entry fails the clock regex. Diverging would let the reminder nominate a
 * shift time the booking form does not offer, and the employee would be nudged
 * toward a slot they cannot select. The `reason` is returned rather than
 * swallowed so the sweep can report it — today that failure is silent, and a
 * single stray space ("9:00, 10:00") empties an org's dropdown with no error.
 */
export function parseTimeList(raw: unknown): ParsedTimeList {
  const parts: unknown[] = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
    ? raw.split(',')
    : [];

  if (parts.length === 0) {
    return { times: [], reason: 'no value configured' };
  }

  const times: string[] = [];
  for (const part of parts) {
    const clock = normalizeClock(part);
    if (!clock) {
      return {
        times: [],
        reason: `malformed shift time "${String(
          part,
        ).trim()}" — whole list rejected`,
      };
    }
    if (!times.includes(clock)) {
      times.push(clock);
    }
  }

  times.sort();
  return { times };
}

/**
 * Team-level resolution.
 *
 * The team branch is taken when EITHER list is non-empty, matching
 * admin-config.controller.ts:222 (`login?.length || logout?.length`). The
 * consequence, kept on purpose so reminders agree with booking: once that
 * branch is taken, an empty list for the other leg stays empty — there is no
 * per-leg fallback to the org.
 *
 * That is not a rare case. The admin FE writes shiftLogoutTime = [] for every
 * auto-logout team, so those teams legitimately have no drop times: the logout
 * is automatic and there is nothing to book. Skipping the drop leg is the
 * intended behaviour, not a gap to paper over.
 *
 * Returns null when the team does not override at all, so the caller falls
 * through to the org cohort.
 */
export function resolveForTeam(team: {
  isShiftEnabled?: boolean;
  shiftLoginTime?: unknown;
  shiftLogoutTime?: unknown;
}): ResolvedShiftTimes | null {
  if (!team?.isShiftEnabled) {
    return null;
  }

  const login = parseTimeList(team.shiftLoginTime);
  const logout = parseTimeList(team.shiftLogoutTime);

  if (login.times.length === 0 && logout.times.length === 0) {
    return null;
  }

  const reasons: string[] = [];
  if (login.times.length === 0) {
    reasons.push(`pick: ${login.reason ?? 'empty'}`);
  }
  if (logout.times.length === 0) {
    reasons.push(`drop: ${logout.reason ?? 'empty'}`);
  }

  return {
    pick: login.times,
    drop: logout.times,
    source: 'team',
    reason: reasons.length > 0 ? reasons.join('; ') : undefined,
  };
}

/** Shift times for one leg. */
export function timesForLeg(
  resolved: ResolvedShiftTimes,
  leg: CutoffLeg,
): string[] {
  return leg === 'pick' ? resolved.pick : resolved.drop;
}
