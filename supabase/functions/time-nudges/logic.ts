// time-nudges/logic.ts — pure decisions + a narrow structural "port" seam,
// so the whole thing is testable without a live Postgres or supabase-js
// transport (aesthete-nightly's RpcClient-fake convention). index.ts boots
// Deno.serve and wires the real service-role client; everything else lives
// here.
//
// HT-34 ruled two nudges. Both are implemented; only rule (a) actually fires
// (see the "what dark means" block in index.ts and 00614's banner) — but
// "reachable" and "fires" are not the same claim (round-1 review, D-R1-01).
// verify_jwt=true is satisfied by ANY JWT signed with the project secret,
// including the publishable anon key that ships in every portal's
// wrangler.jsonc as a committed literal — so before this fix, a POST here
// with an anon bearer routed straight into either rule's handler. index.ts
// now runs `isServiceRoleCaller` (this module, mirroring client-invite's
// lib.ts pattern) before either sweep executes: only the platform's
// service-role credential — what `invoke_edge_function`'s cron bridge
// presents — gets past the door. So each rule now has TWO independent
// reasons it does not fire for anyone but the cron: the request-routing gate
// below, AND (for rule (b) specifically) the opt-in column defaulting to
// false with no writer.
//
//   (a) running_timer  — a running timer over 8h writes ONE quiet Record row
//       (notification_log, channel='in_app'), with `read_at` already stamped
//       so it never inflates the inbox unread badge (D-R1-02 — a nudge is
//       supposed to be a quiet Record row, not an engagement ping). No push,
//       no email, no SMS — structurally true here, not just by convention:
//       this module never imports a dispatch/email/sms helper, and the
//       TimeNudgesPort below exposes no method that could reach one.
//       Idempotent per (user, entry): a fast pre-check (the existing
//       notification_log "query before insert" claim idiom — see
//       lead-expiration-check / back-in-stock-check / price-drop-check) plus
//       a partial UNIQUE index on notification_log backing it at the
//       database layer (00614 — D-R1-03), so two concurrent sweeps can no
//       longer both win the pre-check and both insert. index.ts's port
//       tolerates the resulting 23505 as "someone else already recorded it".
//       A nine-hour timer produces exactly one row across nine hourly
//       sweeps.
//
//   (b) weekly_unlogged — opt-in, at most weekly, reachable ONLY when the
//       caller (a) presents the service-role credential AND (b) sends a body
//       of exactly {"rule":"weekly_unlogged"}. Nothing in prod ever sends
//       that body (00614 schedules only rule "running_timer" and leaves the
//       weekly cron.schedule call commented out), and the opted-in column it
//       reads defaults to false with no portal writer — three independent
//       reasons, not one, is what "built dark" means in code here.

export type NudgeRule = "running_timer" | "weekly_unlogged";

export const RUNNING_TIMER_STALE_HOURS = 8;
export const WEEKLY_LOOKBACK_DAYS = 7;

export const RUNNING_TIMER_NUDGE_TYPE = "time_entry_running_long";
export const WEEKLY_UNLOGGED_NUDGE_TYPE = "time_weekly_unlogged_reminder";

// ─── wire shapes ──────────────────────────────────────────────────────────

export interface RunningTimerRow {
  id: string;
  user_id: string;
  project_id: string | null;
  started_at: string;
}

export interface OptedInMemberRow {
  id: string;
}

export interface NotificationLogInsert {
  user_id: string;
  type: string;
  channel: "in_app";
  status: "delivered";
  metadata: Record<string, unknown>;
  sent_at: string;
}

/**
 * The minimal structural slice of data access `runTimeNudges` needs — lets
 * the deno suite inject a plain in-memory fake instead of a real
 * supabase-js client. `index.ts` is the only file that implements this
 * against Postgres.
 */
export interface TimeNudgesPort {
  /** Rows with `duration_minutes IS NULL` (a running timer) started at or before `cutoffIso`. */
  listStaleRunningTimers(cutoffIso: string): Promise<RunningTimerRow[]>;
  /** True if a running-timer Record row already exists for this (user, entry) pair. */
  hasRunningTimerRecord(userId: string, entryId: string): Promise<boolean>;
  /** Members with `weekly_hours_reminder_opt_in = true` and no time entry started at/after `sinceIso`. */
  listOptedInMembersNeedingWeeklyReminder(
    sinceIso: string,
  ): Promise<OptedInMemberRow[]>;
  /** True if a weekly-unlogged Record row already exists for this (user, week) pair. */
  hasWeeklyUnloggedRecord(userId: string, weekKey: string): Promise<boolean>;
  /** Write one quiet in-app Record row. The only write this module ever performs. */
  insertRecord(row: NotificationLogInsert): Promise<void>;
}

export interface RunResult {
  rule: NudgeRule;
  scanned: number;
  recorded: number;
  skipped: number;
}

// ─── pure helpers ─────────────────────────────────────────────────────────

/**
 * Reachable only when the body is EXACTLY `{"rule":"weekly_unlogged"}`.
 * The default body `{}`, `{"rule":"running_timer"}`, and anything else all
 * resolve to rule (a) — this is the whole of "dark by default" as far as
 * request routing is concerned.
 */
export function resolveNudgeRule(body: unknown): NudgeRule {
  if (
    body !== null &&
    typeof body === "object" &&
    (body as Record<string, unknown>).rule === "weekly_unlogged"
  ) {
    return "weekly_unlogged";
  }
  return "running_timer";
}

export function staleRunningTimerCutoff(now: Date): string {
  return new Date(
    now.getTime() - RUNNING_TIMER_STALE_HOURS * 60 * 60 * 1000,
  ).toISOString();
}

export function weeklyLookbackSince(now: Date): string {
  return new Date(
    now.getTime() - WEEKLY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
}

/**
 * ISO-8601 week key (e.g. "2026-W37"), UTC, Monday-anchored. Stable across
 * every sweep inside the same week, so "at most weekly" is enforced by the
 * dedupe key itself rather than by cron cadence alone.
 */
export function isoWeekKey(now: Date): string {
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const dayNum = (d.getUTCDay() + 6) % 7; // Mon=0 .. Sun=6
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // nearest Thursday
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstThursdayDayNum = (firstThursday.getUTCDay() + 6) % 7;
  const week =
    1 +
    Math.round(
      ((d.getTime() - firstThursday.getTime()) / 86_400_000 -
        3 +
        firstThursdayDayNum) /
        7,
    );
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function buildRunningTimerRecord(
  entry: RunningTimerRow,
  now: Date,
): NotificationLogInsert {
  return {
    user_id: entry.user_id,
    type: RUNNING_TIMER_NUDGE_TYPE,
    channel: "in_app",
    status: "delivered",
    metadata: {
      entry_id: entry.id,
      project_id: entry.project_id,
      started_at: entry.started_at,
      subject: "A timer has been running a while",
      message:
        "A timer you started has been running for more than 8 hours. " +
        "Open the Hours ledger if it should be stopped.",
      // documentHrefFor (post-derivation.ts) reads `project_id` FIRST and
      // always wins over `deep_link` for a project-bearing notice, so a
      // `?sheet=hours` query on deep_link alone never survived (D-R1-07).
      // `sheet` is the key documentHrefFor now honours (post-derivation.ts).
      // deep_link stays: it is the only address for the project-less case
      // (`/desk?book=hours`) and lets any non-Document reader of this row's
      // metadata still find the link without re-deriving it.
      sheet: "hours",
      deep_link: entry.project_id
        ? `/doc/${entry.project_id}?sheet=hours`
        : "/desk?book=hours",
      // A nudge is a quiet Record row (HT-34), not an engagement ping —
      // useUnreadInboxCount treats any in_app row with no `read_at` as
      // unread, so an un-stamped nudge would raise the inbox badge despite
      // "no push, no email, no badge" (D-R1-02). Stamping it here, at
      // write time, is the row's own promise: it always reads as read.
      read_at: now.toISOString(),
    },
    sent_at: now.toISOString(),
  };
}

export function buildWeeklyUnloggedRecord(
  userId: string,
  now: Date,
): NotificationLogInsert {
  return {
    user_id: userId,
    type: WEEKLY_UNLOGGED_NUDGE_TYPE,
    channel: "in_app",
    status: "delivered",
    metadata: {
      week_key: isoWeekKey(now),
      subject: "No hours logged this week",
      message:
        "You opted in to a nudge when nothing's logged — the Hours ledger " +
        "has been quiet this week.",
      deep_link: "/desk?book=hours",
      // Same D-R1-02 reasoning as buildRunningTimerRecord: a quiet Record
      // row never raises the unread badge, even for a rule that cannot fire
      // in prod today — the moment it is ever turned on, this must already
      // be true.
      read_at: now.toISOString(),
    },
    sent_at: now.toISOString(),
  };
}

// ─── orchestration ────────────────────────────────────────────────────────

async function runRunningTimerSweep(
  port: TimeNudgesPort,
  now: Date,
): Promise<RunResult> {
  const entries = await port.listStaleRunningTimers(
    staleRunningTimerCutoff(now),
  );
  let recorded = 0;
  let skipped = 0;
  for (const entry of entries) {
    const exists = await port.hasRunningTimerRecord(entry.user_id, entry.id);
    if (exists) {
      skipped++;
      continue;
    }
    await port.insertRecord(buildRunningTimerRecord(entry, now));
    recorded++;
  }
  return { rule: "running_timer", scanned: entries.length, recorded, skipped };
}

async function runWeeklyUnloggedSweep(
  port: TimeNudgesPort,
  now: Date,
): Promise<RunResult> {
  const candidates = await port.listOptedInMembersNeedingWeeklyReminder(
    weeklyLookbackSince(now),
  );
  const weekKey = isoWeekKey(now);
  let recorded = 0;
  let skipped = 0;
  for (const member of candidates) {
    const exists = await port.hasWeeklyUnloggedRecord(member.id, weekKey);
    if (exists) {
      skipped++;
      continue;
    }
    await port.insertRecord(buildWeeklyUnloggedRecord(member.id, now));
    recorded++;
  }
  return {
    rule: "weekly_unlogged",
    scanned: candidates.length,
    recorded,
    skipped,
  };
}

/**
 * The whole function, minus transport. `body` is the parsed POST body
 * (`{}` from a bare `invoke_edge_function` call, or `{"rule": "..."}`).
 */
export function runTimeNudges(
  port: TimeNudgesPort,
  body: unknown,
  now: Date,
): Promise<RunResult> {
  const rule = resolveNudgeRule(body);
  return rule === "weekly_unlogged"
    ? runWeeklyUnloggedSweep(port, now)
    : runRunningTimerSweep(port, now);
}

// ─── caller verification (D-R1-01 / D-R1-11) ───────────────────────────────
//
// verify_jwt=true (config.toml) proves the bearer is SOME token the project
// signed — the publishable anon key qualifies, since it too is a JWT signed
// with the project secret, and it ships as a committed literal in every
// portal's wrangler.jsonc (CLAUDE.md). That is not "no caller but the cron
// bridge", it is "no caller we bothered to check". This block is the check,
// ported verbatim in shape from client-invite/lib.ts's isServiceRoleCaller —
// same reasoning, same 2026-09-09 key-rotation trap (never string-compare a
// bearer against the injected key alone; Strata carries the new `sb_secret_…`
// format AND long-lived legacy service-role JWTs at once).
//
// Unlike client-invite, this function names no arbitrary writer/signer/
// recipient — every write it makes is a fixed-shape, idempotent, in-app-only
// Record row keyed off data it looked up itself. So a missing check here was
// never a data-integrity hole; the exposure D-R1-01/D-R1-11 named was an
// unauthenticated-in-practice caller being able to run the sweep at an
// attacker-chosen rate (cost: bounded, per D-R1-11; still not a caller this
// function should answer to).

/** Timing-safe string compare. Length is allowed to leak; the bytes are not. */
function secretEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * `SUPABASE_SECRET_KEYS` is injected by the platform as a JSON dictionary of
 * name -> secret key (verified on Strata: {"default":"sb_secret_…"}). Parsed
 * defensively so a future array, or a comma-separated list, still works.
 */
export function parseSecretKeys(raw: string | null | undefined): string[] {
  const text = (raw ?? "").trim();
  if (!text) return [];
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === "string" && v.trim()) out.push(v.trim());
    else if (v && typeof v === "object") {
      const k = (v as { api_key?: unknown }).api_key;
      if (typeof k === "string" && k.trim()) out.push(k.trim());
    }
  };
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) parsed.forEach(push);
    else if (parsed && typeof parsed === "object") {
      Object.values(parsed).forEach(push);
    } else push(parsed);
  } catch {
    text.split(",").forEach((part) => push(part));
  }
  return out;
}

/**
 * The legacy service-role credential is a project-signed HS256 JWT. It may
 * be absent from this function's environment once a project has fully moved
 * to the new key format, so it cannot be string-compared — but the gateway
 * (verify_jwt = true, config.toml) has already verified its signature
 * against the project before the handler runs; a forged one is turned away
 * upstream and never reaches this code. So the claims can be read at face
 * value, and only the service_role of THIS project, unexpired, is admitted.
 *
 * If verify_jwt is ever set false for this function, this arm must go with
 * it — there would then be no gateway signature check to lean on.
 */
function isVerifiedLegacyServiceRoleJwt(
  token: string,
  projectRef?: string | null,
): boolean {
  if (!projectRef) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return false;
  let claims: Record<string, unknown>;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    claims = JSON.parse(
      atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "=")),
    );
  } catch {
    return false;
  }
  if (claims.role !== "service_role") return false;
  if (claims.iss !== "supabase") return false;
  if (claims.ref !== projectRef) return false;
  const exp = claims.exp;
  if (typeof exp !== "number" || exp * 1000 <= Date.now()) return false;
  return true;
}

/**
 * True only for the platform's own service-role principal — what
 * `public.invoke_edge_function`'s cron bridge presents (00258: `apikey` +
 * `Authorization: Bearer <service-role>` from Vault). A project carries TWO
 * shapes of that one principal during Supabase's key-format migration: the
 * new `sb_secret_…` key (what SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SECRET_KEYS
 * now hold) and the legacy service-role JWT (what long-lived callers may
 * still present) — both admitted, neither trusted by exact-string-compare
 * alone.
 */
export function isServiceRoleCaller(
  authorizationHeader: string | null,
  serviceRoleKey: string,
  secretKeys?: string | null,
  projectRef?: string | null,
): boolean {
  const token = (authorizationHeader ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;
  if (serviceRoleKey && secretEquals(token, serviceRoleKey)) return true;
  for (const key of parseSecretKeys(secretKeys)) {
    if (secretEquals(token, key)) return true;
  }
  return isVerifiedLegacyServiceRoleJwt(token, projectRef);
}
