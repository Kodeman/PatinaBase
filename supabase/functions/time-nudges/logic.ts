// time-nudges/logic.ts — pure decisions + a narrow structural "port" seam,
// so the whole thing is testable without a live Postgres or supabase-js
// transport (aesthete-nightly's RpcClient-fake convention). index.ts boots
// Deno.serve and wires the real service-role client; everything else lives
// here.
//
// HT-34 ruled two nudges. Both are implemented; only rule (a) is reachable
// in prod (see the "what dark means" block in index.ts and 00614's banner):
//
//   (a) running_timer  — a running timer over 8h writes ONE quiet Record row
//       (notification_log, channel='in_app'). No push, no email, no SMS —
//       structurally true here, not just by convention: this module never
//       imports a dispatch/email/sms helper, and the TimeNudgesPort below
//       exposes no method that could reach one. Idempotent per (user, entry)
//       via the existing notification_log "query before insert" claim idiom
//       (lead-expiration-check / back-in-stock-check / price-drop-check),
//       so a nine-hour timer produces exactly one row across nine hourly
//       sweeps.
//
//   (b) weekly_unlogged — opt-in, at most weekly, reachable ONLY when the
//       caller's body is exactly {"rule":"weekly_unlogged"}. Nothing in prod
//       ever sends that body (00614 schedules only rule "running_timer" and
//       leaves the weekly cron.schedule call commented out) — this is what
//       "built dark" means in code, not a flag.

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
      deep_link: entry.project_id
        ? `/doc/${entry.project_id}?sheet=hours`
        : "/desk?book=hours",
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
