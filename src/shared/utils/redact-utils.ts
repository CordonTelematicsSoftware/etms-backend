const REDACT_KEYS = [
  'password',
  'confirmPassword',
  'newPassword',
  'oldPassword',
  'hashedPassword',
  'otp',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'apiKey',
  'secret',
];

const REDACTED_VALUE = '[REDACTED]';
const CIRCULAR_VALUE = '[CIRCULAR]';

export function redactSensitiveData(
  input: any,
  seen: WeakSet<object> = new WeakSet(),
): any {
  if (input === null || input === undefined) {
    return input;
  }

  if (typeof input !== 'object') {
    return input;
  }

  // Circular reference guard
  if (seen.has(input)) {
    return CIRCULAR_VALUE;
  }
  seen.add(input);

  if (Array.isArray(input)) {
    return input.map((item) => redactSensitiveData(item, seen));
  }

  const result: Record<string, any> = {};
  for (const key of Object.keys(input)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = REDACT_KEYS.some((redactKey) =>
      lowerKey.includes(redactKey.toLowerCase()),
    );
    result[key] = isSensitive
      ? REDACTED_VALUE
      : redactSensitiveData(input[key], seen);
  }
  return result;
}
