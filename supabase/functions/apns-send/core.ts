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

/**
 * Reads the role claim only after the Edge gateway has verified the JWT.
 * `apns-send` uses this as a second, explicit service-role boundary so an
 * ordinary authenticated user cannot target another user's device tokens.
 */
export function bearerRole(header: string | null): string | null {
  if (!header?.startsWith("Bearer ")) return null;
  const parts = header.slice(7).split(".");
  if (parts.length !== 3) return null;
  try {
    const encoded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = encoded + "=".repeat((4 - encoded.length % 4) % 4);
    const value = JSON.parse(atob(padded)) as { role?: unknown };
    return typeof value.role === "string" ? value.role : null;
  } catch {
    return null;
  }
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
export function buildApnsPayload(
  input: ApnsSendInput,
): Record<string, unknown> {
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

/**
 * Normalize APNS_AUTH_KEY into the PEM shape jose's `importPKCS8` requires.
 *
 * `importPKCS8` REQUIRES the full `-----BEGIN PRIVATE KEY-----` /
 * `-----END PRIVATE KEY-----` framing — it throws `"pkcs8" must be PKCS#8
 * formatted string` on a bare base64 body (confirmed locally against
 * jose@v5.2.0, the version pinned in index.ts). Secrets managers vary in how
 * they store a pasted .p8: some keep the full PEM (possibly with literal
 * `\n` escapes instead of real newlines), some strip the framing and keep
 * only the base64 body. Handle both without asking for a re-paste:
 *  - already has the BEGIN marker → just fix literal `\n` escapes.
 *  - no BEGIN marker → treat as a bare base64 body, strip all whitespace,
 *    rewrap at 64 chars/line, and add the BEGIN/END framing.
 */
export function normalizePkcs8Pem(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.includes("BEGIN PRIVATE KEY")) {
    return trimmed.replace(/\\n/g, "\n");
  }
  const body = trimmed.replace(/\s+/g, "");
  const lines: string[] = [];
  for (let i = 0; i < body.length; i += 64) {
    lines.push(body.slice(i, i + 64));
  }
  return `-----BEGIN PRIVATE KEY-----\n${
    lines.join("\n")
  }\n-----END PRIVATE KEY-----`;
}
