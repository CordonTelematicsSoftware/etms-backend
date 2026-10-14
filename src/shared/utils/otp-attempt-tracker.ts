interface OtpAttemptEntry {
  failedAttempts: number;
  blockedUntil?: number;
}

const otpAttemptStore = new Map<string, OtpAttemptEntry>();

// Clean up stale entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of otpAttemptStore.entries()) {
    if (entry.blockedUntil && now - entry.blockedUntil > 60 * 60 * 1000) {
      otpAttemptStore.delete(key);
    }
  }
}, 10 * 60 * 1000);

const MAX_ATTEMPTS = 4;
const BLOCK_MS = 60 * 1000; // 1 minute

export function checkOtpBlocked(identifier: string): {
  blocked: boolean;
  retryAfterSec?: number;
} {
  const entry = otpAttemptStore.get(identifier);
  if (!entry?.blockedUntil) return { blocked: false };

  const now = Date.now();
  if (now < entry.blockedUntil) {
    return {
      blocked: true,
      retryAfterSec: Math.ceil((entry.blockedUntil - now) / 1000),
    };
  }

  // Block expired — clear it so attempts start counting fresh
  otpAttemptStore.delete(identifier);
  return { blocked: false };
}

export function recordFailedOtpAttempt(identifier: string): void {
  const entry = otpAttemptStore.get(identifier) ?? { failedAttempts: 0 };
  entry.failedAttempts += 1;

  if (entry.failedAttempts >= MAX_ATTEMPTS) {
    entry.blockedUntil = Date.now() + BLOCK_MS;
  }

  otpAttemptStore.set(identifier, entry);
}

export function clearOtpAttempts(identifier: string): void {
  otpAttemptStore.delete(identifier);
}
