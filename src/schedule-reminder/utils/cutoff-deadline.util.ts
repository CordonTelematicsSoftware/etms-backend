import * as moment from 'moment';

/**
 * READ-ONLY replica of the booking-cutoff resolution and deadline maths.
 *
 * This deliberately does NOT call TripRequestService.resolveBookCutoffConfig or
 * applyCutoffValidation. Those are write-path coupled (they load an employee via
 * the employee service, and they signal by throwing BadRequestException on every
 * rejection). A reminder sweep needs the opposite shape: a pure function that
 * answers "when does this config next close, and what period does it gate?"
 * without throwing and without touching the booking flow.
 *
 * Semantics are replicated from, and must stay in step with:
 *   - resolveBookCutoffConfig   trip-request.service.ts:5520-5631
 *   - applyCutoffValidation     trip-request.service.ts:5088-5170
 *   - validateWeeklyCutoff      trip-request.service.ts:5921-6005
 *   - validateMonthlyCutoff     trip-request.service.ts:6007-6068
 *   - validateDailyCutoff       trip-request.service.ts:6070-6183
 *
 * DELIBERATE DIVERGENCES, all of which only ever suppress a reminder — none can
 * widen who is allowed to book, because nothing here is on a write path:
 *
 *  1. Nothing throws. Every malformed config resolves to a skip with a reason.
 *     The live code throws BadRequestException; a sweep must not let one org's
 *     bad config abort the run for every other org.
 *  2. `hourly` is skipped entirely. It expresses a window relative to each
 *     shift's own start time, so it has no single wall-clock instant to remind
 *     ahead of, and an unbooked employee has no shift time yet by definition.
 *  3. `daily,sameday` ignores the shiftDateTime half of its min(). The live rule
 *     is min(configuredCutoff, shiftDateTime); an employee who has not booked has
 *     no shift time, so only configuredCutoff is knowable. The reminder can
 *     therefore fire slightly later than the true deadline for an employee whose
 *     shift starts before the configured cutoff.
 *
 * TIMEZONE: bare moment(), i.e. server local time — matching the live cutoff
 * code exactly. There is no per-org timezone anywhere in this codebase
 * (Organization has no such column). Using a different zone here would make the
 * reminder disagree with the cutoff it is reminding about, which is worse than
 * being uniformly server-local.
 */

export type CutoffLeg = 'pick' | 'drop';
export type ReminderCutoffMode = 'daily' | 'weekly' | 'monthly' | 'hourly';

export interface CutoffDeadline {
  mode: ReminderCutoffMode;
  /** The next upcoming instant at which booking closes. */
  cutoffAt: Date;
  /** Identifies the booking period this cutoff gates. See periodKey note below. */
  periodKey: string;
  /** Inclusive start of the booking period. */
  periodStart: Date;
  /** EXCLUSIVE end of the booking period. */
  periodEnd: Date;
}

export type CutoffConfigResult =
  | { ok: true; configValue: string; source: 'org' | 'team' }
  | { ok: false; reason: string };

export type CutoffDeadlineResult =
  | { ok: true; deadline: CutoffDeadline }
  | { ok: false; reason: string };

/**
 * Should this cutoff be swept on this cron run?
 *
 * Daily ignores SCHEDULE_REMINDER_LEAD entirely — a daily cutoff is always
 * within 24h of "now" by construction (see dailyDeadline below), so a lead
 * window can only ever act as a permanent on/off switch for it, never a
 * genuine "days before" mechanic. Target behaviour: nudge every morning the
 * employee is still unbooked, regardless of lead.
 *
 * Weekly/monthly still gate on the lead window closing in on the cutoff.
 * `windowEnd` is `null` when the org's lead is disabled/unparseable — that
 * must silence weekly/monthly (which need a real window) but not daily.
 */
export function isCutoffInPlay(
  deadline: Pick<CutoffDeadline, 'mode' | 'cutoffAt'>,
  now: moment.Moment,
  windowEnd: moment.Moment | null,
): boolean {
  const cutoffMoment = moment(deadline.cutoffAt);

  if (cutoffMoment.isBefore(now)) {
    return false;
  }

  if (deadline.mode === 'daily') {
    return true;
  }

  return windowEnd !== null && !cutoffMoment.isAfter(windowEnd);
}

/** Minimal shape this module needs off a Team row. */
export interface TeamCutoffSource {
  isTeamConfigEnabled?: boolean;
  teamConfig?: any;
}

const ISO_WEEKDAY: Record<string, number> = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7,
};

/**
 * Team-cell semantics, replicated exactly from resolveBookCutoffConfig
 * :5603-5621. The order matters — 'disable' is tested before '' , and '' is a
 * STRICT equality test, not a falsy test:
 *
 *   missing / null / undefined -> INHERIT the org value
 *   ''         (exact)         -> no restriction at all -> nothing to remind about
 *   'disable'                  -> booking is blocked    -> nothing to remind about
 *   any other string           -> OVERRIDE with that value
 *
 * Note the live code does not trim, so a whitespace-only cell (' ') is NOT the
 * '' case — it becomes the config value and then fails to parse. Live that
 * throws `Invalid cutoff mode:`; here it resolves to a skip further downstream.
 * Same practical outcome for the reminder: no nudge.
 */
export function resolveBookCutoffForReminder(
  team: TeamCutoffSource | null | undefined,
  orgConfigValue: string | null | undefined,
  leg: CutoffLeg,
): CutoffConfigResult {
  const orgValue =
    typeof orgConfigValue === 'string' && orgConfigValue.trim() !== ''
      ? orgConfigValue
      : null;

  const useOrg = (): CutoffConfigResult =>
    orgValue
      ? { ok: true, configValue: orgValue, source: 'org' }
      : { ok: false, reason: 'no org cutoff configured' };

  if (!team) {
    return useOrg();
  }

  if (!team.isTeamConfigEnabled) {
    return useOrg();
  }

  const bookConfig = team.teamConfig?.BOOK;

  if (!bookConfig) {
    return useOrg();
  }

  const cell = leg === 'pick' ? bookConfig.PICK : bookConfig.DROP;

  if (cell === 'disable') {
    return { ok: false, reason: `team ${leg} booking disabled` };
  }

  if (cell === '') {
    return { ok: false, reason: `team ${leg} has no cutoff restriction` };
  }

  if (cell != null) {
    return { ok: true, configValue: String(cell), source: 'team' };
  }

  return useOrg();
}

/**
 * The next upcoming cutoff instant for a config string, plus the booking period
 * that cutoff gates.
 *
 * periodKey deliberately does NOT include the leg. Pick and drop can have
 * different cutoffs, and keying by leg would let one employee be nudged twice
 * for the same booking period. One reminder per employee per period is the
 * intent; ScheduleReminderLog.leg records which leg triggered it.
 */
export function computeNextCutoffDeadline(
  configValue: string,
  now: moment.Moment = moment(),
): CutoffDeadlineResult {
  if (typeof configValue !== 'string' || configValue.trim() === '') {
    return { ok: false, reason: 'empty cutoff config' };
  }

  const parts = configValue.split(',').map((part) => part.trim().toLowerCase());
  const mode = parts[0];

  switch (mode) {
    case 'daily':
      return dailyDeadline(parts, now);
    case 'weekly':
      return weeklyDeadline(parts, now);
    case 'monthly':
      return monthlyDeadline(parts, now);
    case 'hourly':
      // See divergence 2 in the header.
      return { ok: false, reason: 'hourly cutoff is not reminded on in v1' };
    default:
      return { ok: false, reason: `unsupported cutoff mode "${mode}"` };
  }
}

/** "HH:mm" -> [hour, minute], or null if unusable. */
function parseClock(raw: string | undefined): [number, number] | null {
  if (!raw) return null;
  const [hourRaw, minuteRaw] = raw.split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  return [hour, minute];
}

/**
 * daily,previousday,HH:mm -> cutoff today at HH:mm gates TOMORROW
 *                            (live: selectedDate must be tomorrow, cutoff is
 *                             selectedDate - 1 day @ HH:mm, :6109-6114)
 * daily,sameday,HH:mm     -> cutoff today at HH:mm gates TODAY
 *                            (live: selectedDate must be today, :6131-6145)
 *
 * If today's instant has already passed, the next one is tomorrow's, and the
 * gated period rolls with it.
 */
function dailyDeadline(
  parts: string[],
  now: moment.Moment,
): CutoffDeadlineResult {
  const cutoffType = parts[1];
  const clock = parseClock(parts[2]);

  if (!clock) {
    return { ok: false, reason: `invalid daily cutoff time "${parts[2]}"` };
  }
  if (cutoffType !== 'previousday' && cutoffType !== 'sameday') {
    return { ok: false, reason: `invalid daily cutoff type "${cutoffType}"` };
  }

  const [hour, minute] = clock;

  let cutoffAt = now.clone().set({ hour, minute, second: 0, millisecond: 0 });

  if (!cutoffAt.isAfter(now)) {
    cutoffAt = cutoffAt.add(1, 'day');
  }

  // previousday gates the day AFTER the cutoff; sameday gates the cutoff's own day.
  const periodStart =
    cutoffType === 'previousday'
      ? cutoffAt.clone().add(1, 'day').startOf('day')
      : cutoffAt.clone().startOf('day');

  return {
    ok: true,
    deadline: {
      mode: 'daily',
      cutoffAt: cutoffAt.toDate(),
      periodKey: `daily:${periodStart.format('YYYY-MM-DD')}`,
      periodStart: periodStart.toDate(),
      periodEnd: periodStart.clone().add(1, 'day').toDate(),
    },
  };
}

/**
 * weekly,<cutoffDay>,HH:mm,<weekStart>
 *
 * Live (:5961-5983): cutoffDateTime is this ISO week's cutoffDay at HH:mm, and
 * the allowed week is weekStart + (now.isAfter(cutoff) ? 2 : 1) weeks.
 *
 * For the reminder we want the NEXT cutoff instant, so if this week's has
 * passed we roll forward one week. Evaluated from that instant the offset is
 * always 1, which reproduces the live window: a cutoff in ISO week W gates the
 * week beginning weekStart of W plus one week.
 */
function weeklyDeadline(
  parts: string[],
  now: moment.Moment,
): CutoffDeadlineResult {
  const cutoffDay = ISO_WEEKDAY[parts[1]];
  const clock = parseClock(parts[2]);
  const weekStart = ISO_WEEKDAY[parts[3]];

  if (!cutoffDay || !weekStart) {
    return {
      ok: false,
      reason: `invalid weekday in weekly config: "${parts[1]}" or "${parts[3]}"`,
    };
  }
  if (!clock) {
    return { ok: false, reason: `invalid weekly cutoff time "${parts[2]}"` };
  }

  const [hour, minute] = clock;

  let cutoffAt = now
    .clone()
    .isoWeekday(cutoffDay)
    .set({ hour, minute, second: 0, millisecond: 0 });

  if (!cutoffAt.isAfter(now)) {
    cutoffAt = cutoffAt.add(1, 'week');
  }

  const periodStart = cutoffAt
    .clone()
    .isoWeekday(weekStart)
    .add(1, 'week')
    .startOf('day');

  return {
    ok: true,
    deadline: {
      mode: 'weekly',
      cutoffAt: cutoffAt.toDate(),
      // ISO week-year + week number, so the key is stable across a year boundary.
      periodKey: `weekly:${periodStart.format('GGGG-[W]WW')}`,
      periodStart: periodStart.toDate(),
      periodEnd: periodStart.clone().add(7, 'days').toDate(),
    },
  };
}

/**
 * monthly,<dayOfMonth>,HH:mm
 *
 * Live (:6026-6042): safeCutoffDay = min(configured, daysInMonth), and the
 * allowed month is now + (now.isAfter(cutoff) ? 2 : 1) months.
 *
 * Rolling to next month re-clamps the day against THAT month's length, so a
 * configured day of 31 lands on the 30th in a 30-day month rather than spilling
 * into the following month.
 */
function monthlyDeadline(
  parts: string[],
  now: moment.Moment,
): CutoffDeadlineResult {
  const configuredDay = Number(parts[1]);
  const clock = parseClock(parts[2]);

  if (
    !Number.isInteger(configuredDay) ||
    configuredDay < 1 ||
    configuredDay > 31
  ) {
    return { ok: false, reason: `invalid monthly cutoff day "${parts[1]}"` };
  }
  if (!clock) {
    return { ok: false, reason: `invalid monthly cutoff time "${parts[2]}"` };
  }

  const [hour, minute] = clock;

  const instantIn = (reference: moment.Moment): moment.Moment =>
    reference
      .clone()
      .date(Math.min(configuredDay, reference.daysInMonth()))
      .set({ hour, minute, second: 0, millisecond: 0 });

  let cutoffAt = instantIn(now);

  if (!cutoffAt.isAfter(now)) {
    // startOf('month') first so adding a month cannot skip one from day 31.
    cutoffAt = instantIn(now.clone().startOf('month').add(1, 'month'));
  }

  const periodStart = cutoffAt.clone().add(1, 'month').startOf('month');

  return {
    ok: true,
    deadline: {
      mode: 'monthly',
      cutoffAt: cutoffAt.toDate(),
      periodKey: `monthly:${periodStart.format('YYYY-MM')}`,
      periodStart: periodStart.toDate(),
      periodEnd: periodStart.clone().add(1, 'month').toDate(),
    },
  };
}
