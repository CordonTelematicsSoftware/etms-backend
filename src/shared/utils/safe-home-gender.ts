import { Gender } from 'src/shared/enums';

/**
 * Which genders receive the safe-home IVR call after a night-shift deboard.
 * Stored as a comma-separated string on ConfigurationMasters / CompanyConfigs,
 * matching the shape of 'SOS Email Alert Recipients'.
 */
export const SAFE_HOME_GENDERS_CONFIG = 'Safe Home IVR Genders';

/**
 * Preserves the pre-config behaviour exactly: female-only. Applied whenever the
 * config row is absent, blank, or parses to nothing valid — a misconfigured org
 * must not silently widen the safety call, and must not silently disable it.
 */
export const SAFE_HOME_GENDER_FALLBACK: string[] = [Gender.Female];

/**
 * The one value that turns the safe-home call off for an org. Not a Gender, so
 * it can never match an employee — it has to be recognised before the fallback
 * above is applied, or it reads as "matched nothing" and widens back to female.
 *
 * Deliberately NOT the same as a blank value or an absent config row: those stay
 * on the fallback, per the note on SAFE_HOME_GENDER_FALLBACK. Disabling a safety
 * call has to be something an admin chose, not something a config gap did.
 */
export const SAFE_HOME_GENDER_DISABLED = 'None';

/**
 * Splits a raw config value into trimmed, non-empty, lower-cased tokens.
 * Shared so the disable check and the gender read agree on what a token is.
 */
function tokenize(raw: string | null | undefined): string[] {
  return (raw || '')
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length > 0);
}

/**
 * Whether the org has explicitly opted out of the safe-home call.
 *
 * Every token must be the sentinel, so a half-edited 'None,Female' is NOT a
 * disable — it still has a gender selected, and a partially saved value must
 * not be what silences a safety call. Blank and missing produce no tokens and
 * are likewise not a disable; they fall through to SAFE_HOME_GENDER_FALLBACK.
 */
export function isSafeHomeDisabled(raw: string | null | undefined): boolean {
  const tokens = tokenize(raw);
  const disabled = SAFE_HOME_GENDER_DISABLED.toLowerCase();

  return tokens.length > 0 && tokens.every((token) => token === disabled);
}

/**
 * The configured set, with no fallback — empty means the value was blank or
 * nothing in it matched the Gender enum. Callers use the emptiness to tell a
 * deliberate setting apart from a typo; use parseSafeHomeGenders to resolve.
 *
 * The allowed set has to be enforced here: the master row's `configValue` array
 * is not a constraint, it is the option list the admin config form prefills from
 * (config.service.ts:532 -> the FE form -> config.service.ts:576-588 writes the
 * per-org override back), so any string at all can reach this function.
 *
 * Matching is case-insensitive and resolves to the canonical Gender value, since
 * that is what Employee.gender holds. An exact compare dropped a hand-typed
 * 'male', which then fell through to the female-only fallback — the inverse of
 * what was asked for.
 *
 * Unrecognised entries are dropped rather than failing the whole parse:
 * 'Male,xyz' means Male, not "fall back to Female".
 */
export function readSafeHomeGenders(raw: string | null | undefined): string[] {
  const allowed = new Map(
    (Object.values(Gender) as string[]).map((gender) => [
      gender.toLowerCase(),
      gender,
    ]),
  );

  return tokenize(raw)
    .map((gender) => allowed.get(gender))
    .filter((gender) => !!gender);
}

/**
 * The configured set, or female-only when nothing usable was configured.
 * Returns a fresh array so a caller cannot mutate SAFE_HOME_GENDER_FALLBACK.
 */
export function parseSafeHomeGenders(raw: string | null | undefined): string[] {
  const configured = readSafeHomeGenders(raw);

  return configured.length ? configured : [...SAFE_HOME_GENDER_FALLBACK];
}
