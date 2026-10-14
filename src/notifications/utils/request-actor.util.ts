const ACTOR_KEYS = ['id', 'userId', 'sub', 'uuid', '_id', 'adminId'];

export function getActorIdFromRequest(request: unknown): string | undefined {
  if (!request || typeof request !== 'object') {
    return undefined;
  }

  return getActorIdFromValue((request as Record<string, unknown>).user);
}

function getActorIdFromValue(value: unknown, depth = 0): string | undefined {
  if (!value || typeof value !== 'object' || depth > 2) {
    return undefined;
  }

  const record = value as Record<string, unknown>;

  for (const key of ACTOR_KEYS) {
    const actorId = stringifyId(record[key]);

    if (actorId) {
      return actorId;
    }
  }

  return (
    getActorIdFromValue(record.dataValues, depth + 1) ??
    getActorIdFromValue(record.user, depth + 1) ??
    getActorIdFromValue(record.payload, depth + 1)
  );
}

function stringifyId(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return undefined;
}
