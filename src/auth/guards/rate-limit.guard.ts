import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { RATE_LIMIT_KEY, RateLimitOptions } from './rate-limit.decorator';

interface RateLimitEntry {
  // Requests made in the free-attempt phase (before initial block)
  count: number;

  // Requests made after the initial block expired (post-block free attempts)
  postBlockCount: number;

  // Timestamp of the very first request — defines the reset window
  firstRequestAt: number;

  // Whether the initial 1-minute block has been triggered
  blockCount: number;

  // Timestamp until which the user is currently blocked
  blockedUntil?: number;

  // Progressive penalty level — increments on every request during the final block phase
  // Used to extend blockedUntil progressively: i=1 → +1min, i=2 → +2min, etc.
  penaltyLevel: number;

  // Whether the user has entered the final (progressive) block phase
  // true = 7th+ request territory; false = still in initial 1-min block phase
  inFinalBlock: boolean;
}

// In-memory store: key = "METHOD:path:email" or "METHOD:path:phone"
const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up fully expired entries every 10 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    // An entry is expired once the reset window has passed from first request
    // We use a generous 2x windowMs TTL to be safe
    if (now - entry.firstRequestAt > 2 * 60 * 60 * 1000) {
      rateLimitStore.delete(key);
    }
  }
}, 10 * 60 * 1000);

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No @RateLimit decorator on this handler → allow through unchanged
    if (!options) return true;

    const {
      freeAttempts, // 3 — attempts before the first block
      initialBlockMs, // 1 min — duration of the first block
      attemptsAfterBlock, // 2 — attempts allowed after the first block
      resetWindowMs, // 30 min — full reset window
      identifierFields = [],
    } = options;

    // const request: Request = context.switchToHttp().getRequest();
    // const endpoint = `${request.method}:${request.route?.path ?? request.path}`;

    // const bodyParts = identifierFields
    //   .map((field) =>
    //     ((request.body?.[field] as string | undefined) ?? '')
    //       .trim()
    //       .toLowerCase(),
    //   )
    //   .filter(Boolean);
    //commented above when testing the security pin validation
    const request: Request = context.switchToHttp().getRequest();
    const user: any = (request as any).user;
    const endpoint = `${request.method}:${request.route?.path ?? request.path}`;

    const bodyParts = identifierFields
      .map((field) => {
        const value =
          (request.body?.[field] as string | undefined) ??
          (user?.[field] != null ? String(user[field]) : undefined) ??
          '';
        return value.trim().toLowerCase();
      })
      .filter(Boolean);

    const storeKey = [endpoint, ...bodyParts].join(':');
    const now = Date.now();
    const entry = rateLimitStore.get(storeKey);

    // ── Reset window has expired → wipe everything, fresh start ──────────────
    if (entry && now - entry.firstRequestAt > resetWindowMs) {
      rateLimitStore.delete(storeKey);
      rateLimitStore.set(storeKey, {
        count: 1,
        postBlockCount: 0,
        firstRequestAt: now,
        blockCount: 0,
        penaltyLevel: 0,
        inFinalBlock: false,
      });
      return true;
    }

    // ── No entry at all → very first request ─────────────────────────────────
    if (!entry) {
      rateLimitStore.set(storeKey, {
        count: 1,
        postBlockCount: 0,
        firstRequestAt: now,
        blockCount: 0,
        penaltyLevel: 0,
        inFinalBlock: false,
      });
      return true;
    }

    // ── User is in FINAL BLOCK phase (7th+ request territory) ────────────────
    if (entry.inFinalBlock) {
      if (entry.blockedUntil && now < entry.blockedUntil) {
        // Still blocked → extend blockedUntil by penaltyLevel minutes
        entry.penaltyLevel += 1;
        const extensionMs = entry.penaltyLevel * 60 * 1000;
        entry.blockedUntil = entry.blockedUntil + extensionMs;
        entry.count += 1;
        rateLimitStore.set(storeKey, entry);

        const retryAfterSec = Math.ceil((entry.blockedUntil - now) / 1000);
        this.throwTooMany(retryAfterSec);
      } else {
        // Final block has expired but reset window hasn't → this shouldn't
        // normally happen (final block should outlast the window), but handle
        // it gracefully by wiping and starting fresh
        rateLimitStore.delete(storeKey);
        rateLimitStore.set(storeKey, {
          count: 1,
          postBlockCount: 0,
          firstRequestAt: now,
          blockCount: 0,
          penaltyLevel: 0,
          inFinalBlock: false,
        });
        return true;
      }
    }

    // ── User is in INITIAL BLOCK (1-minute cooldown after 3rd attempt) ───────
    if (!entry.inFinalBlock && entry.blockCount === 1) {
      if (entry.blockedUntil && now < entry.blockedUntil) {
        // Still in the 1-minute block
        const retryAfterSec = Math.ceil((entry.blockedUntil - now) / 1000);
        this.throwTooMany(retryAfterSec);
      }
      // 1-minute block has passed → allow, track post-block attempts separately
      entry.postBlockCount += 1;

      // attemptsAfterBlock(2): user gets 2 more free requests after the initial block
      // Once postBlockCount exceeds attemptsAfterBlock, trigger the final block
      if (entry.postBlockCount > attemptsAfterBlock) {
        // Trigger final block — set blockedUntil to resetWindowMs from first request
        const blockedUntil = entry.firstRequestAt + resetWindowMs;
        entry.blockedUntil = blockedUntil;
        entry.inFinalBlock = true;
        entry.penaltyLevel = 1; // next retry will add 1 min, then 2, then 3...
        rateLimitStore.set(storeKey, entry);

        const retryAfterSec = Math.ceil((blockedUntil - now) / 1000);
        this.throwTooMany(retryAfterSec);
      }

      rateLimitStore.set(storeKey, entry);
      return true;
    }

    // ── Normal flow: within free attempts ────────────────────────────────────
    entry.count += 1;

    if (entry.count > freeAttempts) {
      // Trigger the initial 1-minute block
      entry.blockCount = 1;
      entry.blockedUntil = now + initialBlockMs;
      rateLimitStore.set(storeKey, entry);

      const retryAfterSec = Math.ceil(initialBlockMs / 1000);
      this.throwTooMany(retryAfterSec);
    }

    rateLimitStore.set(storeKey, entry);
    return true;
  }

  private throwTooMany(retryAfterSec: number): never {
    const retryAfterMin = Math.ceil(retryAfterSec / 60);
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: `Too many requests. Please try again after approximately ${retryAfterMin} minute${
          retryAfterMin === 1 ? '' : 's'
        }.`,
        retryAfter: retryAfterSec, // kept in seconds for programmatic use (e.g. frontend countdown timers)
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
