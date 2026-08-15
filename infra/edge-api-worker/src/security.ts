const REDACTED = '[REDACTED]';
const SENSITIVE_KEY =
  /authorization|apikey|api_key|cookie|token|secret|password|email|phone|address|name|body|content|claims|params|query|sql|stack|cause|message/i;

export function redactRecord(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactRecord);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
      key,
      SENSITIVE_KEY.test(key) ? REDACTED : redactRecord(nested),
    ]),
  );
}

export function structuredLog(event: Record<string, unknown>): void {
  console.log(JSON.stringify(redactRecord(event)));
}

export function traceIdFor(
  request: Request,
  randomUUID: () => string = () => crypto.randomUUID(),
): string {
  const supplied = request.headers.get('x-patina-trace-id');
  if (supplied && /^[A-Za-z0-9_-]{16,128}$/.test(supplied)) return supplied;
  return randomUUID();
}

export function rolloutBucket(key: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % 100;
}

export function isSelectedForRollout(key: string, percentage: number): boolean {
  if (percentage <= 0) return false;
  if (percentage >= 100) return true;
  return rolloutBucket(key) < percentage;
}

export function clampPercentage(value: string | undefined): number {
  const parsed = Number(value ?? '0');
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(100, Math.max(0, Math.floor(parsed)));
}

export function isEnabled(value: string | undefined): boolean {
  return value?.toLowerCase() === 'true';
}
