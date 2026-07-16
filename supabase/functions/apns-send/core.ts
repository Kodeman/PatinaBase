// apns-send core — pure, dependency-free helpers (Arrival Arc, I66).
//
// Kept separate from index.ts so the structural test under _tests/ can assert
// host selection, payload shape, and token normalization without a live stack
// (the catalog-normalizer core.ts pattern).

export type ApnsEnvironment = "sandbox" | "production";

export interface ApnsSendInput {
  user_id?: string;
  /** Explicit tokens override the user_id lookup. Strings are allowed; their
   *  environment is then resolved from device_push_tokens (I66: NEVER
   *  inferred). */
  tokens?: Array<string | { token: string; environment?: ApnsEnvironment }>;
  title: string;
  body: string;
  entity_type?: string;
  entity_id?: string;
  notification_log_id?: string;
}

export interface ResolvedToken {
  token: string;
  environment: ApnsEnvironment;
}

/** I66: the APNs host is chosen PER TOKEN from its registration environment —
 *  today's builds sign as Apple Development, so expect sandbox tokens until a
 *  true distribution archive ships. */
export function apnsHostFor(environment: ApnsEnvironment): string {
  return environment === "production"
    ? "https://api.push.apple.com"
    : "https://api.sandbox.push.apple.com";
}

export function apnsDeviceUrl(t: ResolvedToken): string {
  return `${apnsHostFor(t.environment)}/3/device/${t.token}`;
}

/** The push payload: a standard alert + the routing refs the iOS
 *  NotificationRouter expects (mirrors notification_log metadata keys). */
export function buildApnsPayload(input: ApnsSendInput): Record<string, unknown> {
  return {
    aps: {
      alert: { title: input.title, body: input.body },
      sound: "default",
    },
    entity_type: input.entity_type ?? null,
    entity_id: input.entity_id ?? null,
    notification_log_id: input.notification_log_id ?? null,
  };
}

/**
 * Normalize the input token list against DB rows.
 *  - object entries with an explicit environment pass through;
 *  - bare strings (or objects without environment) resolve their environment
 *    from the matching device_push_tokens row;
 *  - tokens with no known environment are DROPPED (returned in `unresolved`) —
 *    guessing a host guarantees BadDeviceToken half the time (I66).
 */
export function resolveTokens(
  requested: NonNullable<ApnsSendInput["tokens"]>,
  dbRows: Array<{ token: string; environment: string }>,
): { resolved: ResolvedToken[]; unresolved: string[] } {
  const envByToken = new Map<string, ApnsEnvironment>();
  for (const row of dbRows) {
    if (row.environment === "sandbox" || row.environment === "production") {
      envByToken.set(row.token, row.environment);
    }
  }

  const resolved: ResolvedToken[] = [];
  const unresolved: string[] = [];
  for (const entry of requested) {
    const token = typeof entry === "string" ? entry : entry.token;
    const explicit = typeof entry === "string" ? undefined : entry.environment;
    const environment = explicit ?? envByToken.get(token);
    if (environment === "sandbox" || environment === "production") {
      resolved.push({ token, environment });
    } else {
      unresolved.push(token);
    }
  }
  return { resolved, unresolved };
}

/** APNs response classification: 410 (or Unregistered/BadDeviceToken reasons)
 *  means the token is dead and its row should be deleted. */
export function isDeadTokenResponse(status: number, reason?: string): boolean {
  if (status === 410) return true;
  return reason === "BadDeviceToken" || reason === "Unregistered";
}
