import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rateLimitOptions';

export interface RateLimitOptions {
  /** Number of free attempts before the first block (default: 3) */
  freeAttempts: number;

  /** Duration of the initial block in milliseconds (e.g. 1 * 60 * 1000 = 1 min) */
  initialBlockMs: number;

  /** Number of attempts allowed after the initial block before final block (default: 2) */
  attemptsAfterBlock: number;

  /**
   * Full reset window in milliseconds (e.g. 30 * 60 * 1000 = 30 min).
   * After this window expires from the first request, everything resets cleanly.
   * Also used as the base duration for the final progressive block.
   */
  resetWindowMs: number;

  /**
   * Request body fields appended to the IP to form the rate-limit key.
   * E.g. ['email'] means each (IP + email) pair is tracked separately.
   */
  identifierFields?: string[];
}

/**
 * Apply to a controller method to enable progressive backoff rate limiting.
 *
 * Behaviour:
 *  - First `freeAttempts` requests are allowed freely.
 *  - On exceeding freeAttempts → blocked for `initialBlockMs`.
 *  - After block: `attemptsAfterBlock` more requests allowed.
 *  - On exceeding those → final block set to end of resetWindow.
 *    Every retry during final block extends it further (i=1, then i+1 min, ...).
 *  - After resetWindow expires from first request → full clean reset.
 *
 * @example
 * @RateLimit({
 *   freeAttempts: 3,
 *   initialBlockMs: 1 * 60 * 1000,
 *   attemptsAfterBlock: 2,
 *   resetWindowMs: 30 * 60 * 1000,
 *   identifierFields: ['email'],
 * })
 */
export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, options);
