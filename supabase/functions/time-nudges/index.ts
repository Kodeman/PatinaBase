// Supabase Edge Function: time-nudges
//
// HT-34 (hour-tracking program, W4 / lane D). Cron-invoked hourly via
// public.invoke_edge_function (00614: 'time-nudges-hourly', service-role
// bearer + apikey from Vault, 00258's invoke_edge_function/app_setting
// pattern) — same cron->edge bridge as decision-reminders/field-daily/
// morning-brief. verify_jwt = true is the platform default (explicit in
// config.toml for intent, matching those functions).
//
// CORRECTED, round-1 review (D-R1-01 / D-R1-11): verify_jwt=true does NOT
// mean "only the cron can call this". It is satisfied by any JWT signed with
// the project secret, including the publishable anon key — a committed
// literal in every portal's wrangler.jsonc (CLAUDE.md). Before this fix,
// `POST /functions/v1/time-nudges` with `Authorization: Bearer <anon key>`
// and body `{"rule":"weekly_unlogged"}` reached `runWeeklyUnloggedSweep`
// exactly as readily as the cron does; the only thing that kept rule (b)
// inert was the opt-in column defaulting to false with no writer (still
// true, and still asserted below), which is a different guarantee than "the
// rule cannot fire" and one write-surface away from no longer holding. So
// this function runs `isServiceRoleCaller` (logic.ts, ported in shape from
// client-invite's lib.ts — same 2026-09-09 key-rotation trap: never
// string-compare the bearer against the injected key alone) before rule (b)
// executes, and 403s anyone who is not the platform's own service-role
// principal. No CORS: never browser-called.
//
// NARROWED, round-2 review (D-R2-01): round-1 gated BOTH arms on
// isServiceRoleCaller. That is unproven against the only caller that
// matters — invoke_edge_function (00258) sends the Vault-literal service-role
// bearer, provisioned at deploy time, and that literal's exact shape (env
// key? SUPABASE_SECRET_KEYS member? a legacy JWT with iss='supabase' /
// ref=<project ref>?) has never been confirmed on Strata against any of
// isServiceRoleCaller's three admitted arms. If it satisfies none, the
// hourly cron 403s invisibly forever (cron.job_run_details still reports
// 'succeeded' — net.http_post only enqueues the request — and an empty
// notification_log reads identically to "no stale timers"). So the gate now
// binds ONLY the weekly_unlogged arm, restoring D-R1-01's original option
// (b): that arm already has two independent reasons it cannot fire in prod
// (00614 never schedules it; the opt-in column defaults to false with no
// portal writer) and losing nothing by adding a third. The live rule,
// running_timer, is ungated — matching its cron peers (decision-reminders,
// field-daily, morning-brief), none of which carry an in-code caller check
// either — and can no longer be silenced by an unverified credential shape.
//
// Two rules, one reachable in prod:
//
//   (a) running_timer  — LIVE, UNGATED. A running timer (duration_minutes IS
//       NULL) started more than 8 hours ago gets exactly one quiet Record row
//       (notification_log, channel='in_app', `read_at` pre-stamped so it
//       never raises the inbox badge — D-R1-02) per sweep-cycle — idempotent
//       per (user_id, entry_id): a fast pre-check plus a partial UNIQUE
//       index on notification_log (00614 — D-R1-03) backing it at the
//       database layer, so a 9-hour timer swept hourly (or raced) produces
//       exactly one row. No push, no email, no SMS: this function never
//       imports or calls sendCompliantEmail, sms-dispatch, or apns-send —
//       the notification_log insert below is the entire effect.
//
//   (b) weekly_unlogged — BUILT DARK, GATED. Reachable only when the caller
//       is the platform's service-role principal AND the POST body is
//       exactly {"rule":"weekly_unlogged"}. 00614 never schedules that body
//       (its weekly cron.schedule call is a commented-out block) and no
//       profile is opted in by default. See logic.ts's header for the full
//       contract.
//
// D-R2-06: one public.job_runs row per sweep (started / succeeded / failed),
// the same idiom morning-brief uses — so "the cron never ran" is
// distinguishable from "nothing to nudge" on a table this function actually
// writes, unlike cron.job_run_details.
//
// All decisions and every dedupe check live in logic.ts, tested without a
// live Postgres via the TimeNudgesPort fake (deno suite: index.test.ts).

import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2";
import {
  isServiceRoleCaller,
  type NotificationLogInsert,
  type OptedInMemberRow,
  resolveNudgeRule,
  RUNNING_TIMER_NUDGE_TYPE,
  type RunningTimerRow,
  runTimeNudges,
  type TimeNudgesPort,
  WEEKLY_UNLOGGED_NUDGE_TYPE,
} from "./logic.ts";

/** The two known idempotency indexes (00614 — D-R1-03). A 23505 whose message
 *  names one of these IS the idempotency guarantee working, not a failure —
 *  see insertRecord below (D-R2-07). */
const IDEMPOTENCY_UNIQUE_INDEXES = [
  "uniq_notification_log_time_entry_running_long",
  "uniq_notification_log_time_weekly_unlogged",
];

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_SECRET_KEYS = Deno.env.get("SUPABASE_SECRET_KEYS") ?? "";
// Host label of https://<ref>.supabase.co — pins the legacy-JWT arm to this
// project (isVerifiedLegacyServiceRoleJwt, logic.ts), same derivation as
// client-invite/index.ts.
const PROJECT_REF = (() => {
  try {
    return new URL(SUPABASE_URL).hostname.split(".")[0] || null;
  } catch {
    return null;
  }
})();

/** The one and only real implementation of TimeNudgesPort — talks to Postgres. */
function buildPort(supabase: SupabaseClient): TimeNudgesPort {
  return {
    async listStaleRunningTimers(cutoffIso) {
      const { data, error } = await supabase
        .from("project_time_entries")
        .select("id, user_id, project_id, started_at")
        .is("duration_minutes", null)
        .lte("started_at", cutoffIso);
      if (error) throw error;
      return (data ?? []) as RunningTimerRow[];
    },

    async hasRunningTimerRecord(userId, entryId) {
      const { count, error } = await supabase
        .from("notification_log")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("type", RUNNING_TIMER_NUDGE_TYPE)
        .eq("channel", "in_app")
        .contains("metadata", { entry_id: entryId });
      if (error) throw error;
      return (count ?? 0) > 0;
    },

    async listOptedInMembersNeedingWeeklyReminder(sinceIso) {
      const { data: optedIn, error } = await supabase
        .from("profiles")
        .select("id")
        .eq("weekly_hours_reminder_opt_in", true);
      if (error) throw error;

      const out: OptedInMemberRow[] = [];
      for (const member of (optedIn ?? []) as { id: string }[]) {
        const { count, error: entryError } = await supabase
          .from("project_time_entries")
          .select("id", { count: "exact", head: true })
          .eq("user_id", member.id)
          .gte("started_at", sinceIso);
        if (entryError) throw entryError;
        if ((count ?? 0) === 0) out.push({ id: member.id });
      }
      return out;
    },

    async hasWeeklyUnloggedRecord(userId, weekKey) {
      const { count, error } = await supabase
        .from("notification_log")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("type", WEEKLY_UNLOGGED_NUDGE_TYPE)
        .eq("channel", "in_app")
        .contains("metadata", { week_key: weekKey });
      if (error) throw error;
      return (count ?? 0) > 0;
    },

    async insertRecord(row: NotificationLogInsert) {
      const { error } = await supabase.from("notification_log").insert(row);
      if (error) {
        const code = (error as { code?: string }).code;
        const message = (error as { message?: string }).message ?? "";
        // D-R2-07: match the SPECIFIC idempotency indexes, not the bare
        // 23505 code. Today those are the only two unique constraints on
        // notification_log besides the pkey and an unrelated partial index
        // scoped to type='project_file_changed', so the bare-code check was
        // safe in practice — but it stops being true the moment any other
        // unique constraint lands on this table, at which point a genuine
        // insert failure would be silently counted as a successful record.
        if (
          code === "23505" &&
          IDEMPOTENCY_UNIQUE_INDEXES.some((name) => message.includes(name))
        ) {
          return;
        }
        if (code === "23505") {
          // An unrecognized unique-violation on this table: not our
          // idempotency guarantee. Surface it loudly rather than swallow it.
          console.warn(
            "time-nudges: unexpected 23505 on notification_log, not matching a known idempotency index",
            message,
          );
        }
        throw error;
      }
    },
  };
}

async function readBody(req: Request): Promise<unknown> {
  try {
    const text = await req.text();
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await readBody(req);
  const rule = resolveNudgeRule(body);

  // D-R2-01 (narrowing D-R1-01/D-R1-11): gate ONLY the dark weekly_unlogged
  // arm on the platform's service-role principal. running_timer stays
  // ungated, matching its cron peers (decision-reminders, field-daily,
  // morning-brief) — see the header comment for why an unverified Vault
  // literal must never be able to silently 403 the one rule that ships.
  if (
    rule === "weekly_unlogged" &&
    !isServiceRoleCaller(
      req.headers.get("Authorization"),
      SUPABASE_SERVICE_ROLE_KEY,
      SUPABASE_SECRET_KEYS,
      PROJECT_REF,
    )
  ) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const port = buildPort(supabase);

  // D-R2-06: one job_runs row per sweep (morning-brief's idiom, 00300) — the
  // only surface on which "never ran" becomes distinguishable from "nothing
  // to nudge". cron.job_run_details reports 'succeeded' merely because
  // net.http_post enqueued the request; this function otherwise writes no
  // row at all when there is nothing to record.
  const { data: runRow, error: runRowError } = await supabase
    .from("job_runs")
    .insert({ job_name: "time-nudges", status: "running", detail: { rule } })
    .select("id")
    .single();
  if (runRowError) {
    console.error("time-nudges: failed to open job_runs row", runRowError);
  }
  const runId = runRow?.id as number | undefined;

  try {
    const result = await runTimeNudges(port, body, new Date());
    if (runId != null) {
      await supabase
        .from("job_runs")
        .update({
          status: "succeeded",
          finished_at: new Date().toISOString(),
          detail: { ...result },
        })
        .eq("id", runId);
    }
    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    // D-R1-10: log the real detail server-side only. Echoing it in the
    // response leaks Postgres/PostgREST internals (relation, column and
    // constraint names) to the caller.
    const detail =
      err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error("time-nudges: run failed", detail);
    if (runId != null) {
      await supabase
        .from("job_runs")
        .update({
          status: "failed",
          finished_at: new Date().toISOString(),
          error: detail,
        })
        .eq("id", runId);
    }
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
