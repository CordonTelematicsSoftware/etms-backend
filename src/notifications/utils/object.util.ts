export function toErrorDetails(error: unknown): {
  code?: string;
  message: string;
  raw?: unknown;
} {
  if (error instanceof Error) {
    const maybeCode = (error as Error & { code?: string }).code;
    return {
      code: maybeCode,
      message: error.message,
    };
  }

  if (typeof error === 'object' && error !== null) {
    const record = error as Record<string, unknown>;
    return {
      code: typeof record.code === 'string' ? record.code : undefined,
      message:
        typeof record.message === 'string'
          ? record.message
          : JSON.stringify(record),
      raw: record,
    };
  }

  return { message: String(error) };
}

export function stringifyFirebaseData(
  value: Record<string, unknown>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      typeof item === 'string' ? item : JSON.stringify(item),
    ]),
  );
}

export function stripHtml(value: string): string {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
