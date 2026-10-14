interface SafeHomePinAttemptEntry {
  failedAttempts: number;
  ivrTriggered: boolean;
}

const safeHomePinStore = new Map<string, SafeHomePinAttemptEntry>();

setInterval(() => {
  // Simple cleanup — entries older than 1 hour are almost certainly stale
  // (trip requests don't stay "pending PIN confirmation" that long)
  safeHomePinStore.clear();
}, 60 * 60 * 1000);

const MAX_PIN_ATTEMPTS = 3;

export function recordFailedSafeHomePinAttempt(tripRequestID: string): {
  attemptsExceeded: boolean;
  alreadyTriggered: boolean;
} {
  const entry = safeHomePinStore.get(tripRequestID) ?? {
    failedAttempts: 0,
    ivrTriggered: false,
  };

  if (entry.ivrTriggered) {
    return { attemptsExceeded: true, alreadyTriggered: true };
  }

  entry.failedAttempts += 1;
  const attemptsExceeded = entry.failedAttempts >= MAX_PIN_ATTEMPTS;

  if (attemptsExceeded) {
    entry.ivrTriggered = true;
  }

  safeHomePinStore.set(tripRequestID, entry);
  return { attemptsExceeded, alreadyTriggered: false };
}

// Called by BOTH the wrong-attempt path and the delayed timer path,
// so whichever fires first "claims" the IVR call and the other skips it.
export function tryClaimIvrTrigger(tripRequestID: string): boolean {
  const entry = safeHomePinStore.get(tripRequestID) ?? {
    failedAttempts: 0,
    ivrTriggered: false,
  };

  if (entry.ivrTriggered) {
    return false; // someone already triggered it
  }

  entry.ivrTriggered = true;
  safeHomePinStore.set(tripRequestID, entry);
  return true; // this caller gets to trigger it
}

export function clearSafeHomePinAttempts(tripRequestID: string): void {
  safeHomePinStore.delete(tripRequestID);
}
