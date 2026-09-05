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

/** One recent in_app row, as the badge counter reads it. */
export interface BadgeRow {
  metadata?: Record<string, unknown> | null;
  opened_at?: string | null;
  status?: string | null;
}

/**
 * Read, as the BELL decides read: `opened_at` set, or a status the app treats
 * as read on its own (`NotificationsAPIClient.swift`'s
 * `opened_at != nil || status == "opened" || status == "clicked"`). Keying on
 * `opened_at` alone made the icon disagree with the app over a clicked row.
 */
export function badgeRowIsRead(row: BadgeRow): boolean {
  const openedAt = row?.opened_at ?? null;
  if (openedAt !== null) return true;
  return row?.status === "opened" || row?.status === "clicked";
}

/**
 * The springboard number (R5), counted the way the BELL counts it.
 *
 * The bell collapses its rows on `entity_type|entity_id`
 * (`NotificationsViewModel.collapseDuplicates`) because more than one row can
 * name one thing: 00534's `notify_client_attention` de-dups its own bell row,
 * but 00289's design-request triggers do not, so two status changes on one lead
 * leave two in_app rows for one entity. A raw count therefore painted a
 * home-screen number the app itself would never draw — and the app only
 * rewrites the badge when the feed loads, so the wrong number would stand for
 * as long as the app stayed closed, which is the whole point of the badge.
 *
 * Collapsing alone was not enough: the bell's tie-break is that a read twin
 * marks the survivor read (`collapseDuplicates`' `else if row.isRead` branch,
 * pinned by `BellQueueFallbackTests` "a read twin marks the surviving row
 * read"), so ONE entity counts only while NONE of its rows is read. Counting an
 * entity as unread because some row of it was unread left the icon saying 1
 * where the bell said 0 — she taps a row, `markOpened` stamps that row, the
 * older twin stays unstamped. Hence: rows arrive unfiltered by read state and
 * an entity is dropped as soon as any of its rows reads as read.
 *
 * Rows with no entity key are counted individually, exactly as the bell keeps
 * them: they name nothing to collapse onto.
 */
export function collapsedBadgeCount(rows: BadgeRow[]): number {
  let count = 0;
  const unreadByEntity = new Map<string, boolean>();
  for (const row of rows) {
    const read = badgeRowIsRead(row);
    const metadata = row?.metadata ?? null;
    const entityType = metadata?.entity_type;
    const entityId = metadata?.entity_id;
    if (typeof entityType !== "string" || typeof entityId !== "string") {
      if (!read) count++;
      continue;
    }
    const key = `${entityType}|${entityId}`;
    const stillUnread = unreadByEntity.get(key) ?? true;
    unreadByEntity.set(key, stillUnread && !read);
  }
  for (const unread of unreadByEntity.values()) {
    if (unread) count++;
  }
  return count;
}

/**
 * The notification category the lock screen looks up for its actions (P-22).
 * Derived from the entity the row already names — no producer passes it, and
 * none needs to. An entity the app has no category for gets none: iOS then
 * draws the plain banner, which is exactly the graceful degradation the
 * proposal asks for.
 */
const ENTITY_CATEGORY: Record<string, string> = {
  decision: "PATINA_DECISION",
  proposal: "PATINA_PROPOSAL",
  invoice: "PATINA_INVOICE",
};

export function apnsCategoryFor(
  entityType: string | null | undefined,
): string | null {
  if (typeof entityType !== "string") return null;
  return ENTITY_CATEGORY[entityType] ?? null;
}

/**
 * One thread per thing (P-22): `decision-<id>`, `proposal-<id>`,
 * `invoice-<id>`. iOS groups a thread's notifications together. Grouping is
 * safe for every entity — it stacks the notices, it never replaces one — so
 * this is derived for any entity that names an id, routed or not.
 *
 * APNs caps `apns-collapse-id` at 64 bytes and rejects the request outright
 * past it, so an over-long id yields no thread rather than a failed push. An
 * entity with no id has nothing to thread on.
 */
export function apnsThreadId(input: ApnsSendInput): string | null {
  const entityType = input.entity_type;
  const entityId = input.entity_id;
  if (typeof entityType !== "string" || !entityType) return null;
  if (typeof entityId !== "string" || !entityId) return null;
  const id = `${entityType}-${entityId}`;
  return new TextEncoder().encode(id).length <= 64 ? id : null;
}

/**
 * The request headers for one device send.
 *
 * `apns-collapse-id` is the thread id (P-22), and it is sent ONLY for an
 * entity this app routes — decision, proposal, invoice. Collapsing REPLACES an
 * unread notice with the next one carrying the same id, which is exactly what
 * a reminder for one approval should do and exactly what must never happen to
 * two different events that merely name the same row. Three design_request
 * producers push on the lead id (00330 accept, 00331 ceremony complete, 00334
 * refreshed slots); collapsing those would have let "your studio accepted" be
 * swallowed by "new times are offered", while the bell — written separately,
 * outside notify_client_attention's dedupe — still listed both. So the gate is
 * the category: an entity whose notices are a known repeating ask collapses,
 * everything else stacks.
 *
 * Omitted, never blank, when there is none — an empty collapse id is not the
 * same as no collapse id, and APNs treats "" as a real (shared) bucket.
 */
export function buildApnsHeaders(
  input: ApnsSendInput,
  topic: string,
  jwt: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    authorization: `bearer ${jwt}`,
    "apns-topic": topic,
    "apns-push-type": "alert",
    "apns-priority": "10",
    "content-type": "application/json",
  };
  const thread = apnsThreadId(input);
  if (thread && apnsCategoryFor(input.entity_type)) {
    headers["apns-collapse-id"] = thread;
  }
  return headers;
}

/**
 * The push payload: a standard alert + the routing refs the iOS
 * NotificationRouter expects (mirrors notification_log metadata keys).
 *
 * `badge` is the springboard number iOS paints on the app icon while the app is
 * backgrounded (R5): the recipient's unread in-app count collapsed on the
 * entity key, resolved by the caller. It is OMITTED, never zeroed, when that
 * count could not be read — an absent key leaves the badge as it stands, where
 * a 0 would silently clear a number that is still true.
 *
 * P-22 adds three keys, all derived from what the row already carries:
 *  - `category` — which action set the lock screen offers (Open / Ask a
 *    question; never Approve or Sign).
 *  - `thread-id` — one thread per thing, matching `apns-collapse-id`.
 *  - `interruption-level: "active"` — the notice wakes the screen and is
 *    never `time-sensitive`. A homeowner's approval is not an emergency, and
 *    time-sensitive would break through a Focus the studio was not invited into.
 *
 * The Notification Service Extension is deferred by ruling, so there is no
 * `mutable-content` and no attachment key here.
 */
export function buildApnsPayload(
  input: ApnsSendInput,
  badge?: number,
): Record<string, unknown> {
  const aps: Record<string, unknown> = {
    alert: { title: input.title, body: input.body },
    sound: "default",
    "interruption-level": "active",
  };
  if (typeof badge === "number" && Number.isFinite(badge) && badge >= 0) {
    aps.badge = Math.trunc(badge);
  }
  const category = apnsCategoryFor(input.entity_type);
  if (category) aps.category = category;
  const thread = apnsThreadId(input);
  if (thread) aps["thread-id"] = thread;
  return {
    aps,
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
