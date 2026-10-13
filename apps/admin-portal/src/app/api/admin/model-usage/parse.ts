// Shared body parsing for the model-usage setter routes. Route files may only
// export HTTP handlers, so the helpers live here.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** A USD cap: a finite number >= 0. `allowNull` admits null (meaning "no cap"). */
export function parseCap(
  value: unknown,
  allowNull: boolean,
): { ok: true; value: number | null } | { ok: false } {
  if (value === null && allowNull) return { ok: true, value: null };
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return { ok: true, value };
  }
  return { ok: false };
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
