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
// this function now runs `isServiceRoleCaller` (logic.ts, ported in shape
// from client-invite's lib.ts — same 2026-09-09 key-rotation trap: never
// string-compare the bearer against the injected key alone) before EITHER
// rule executes, and 403s anyone who is not the platform's own service-role
// principal. No CORS: never browser-called.
//
// Two rules, one reachable in prod, both now behind the same door:
//
//   (a) running_timer  — LIVE. A running timer (duration_minutes IS NULL)
//       started more than 8 hours ago gets exactly one quiet Record row
//       (notification_log, channel='in_app', `read_at` pre-stamped so it
//       never raises the inbox badge — D-R1-02) per sweep-cycle — idempotent
//       per (user_id, entry_id): a fast pre-check plus a partial UNIQUE
//       index on notification_log (00614 — D-R1-03) backing it at the
//       database layer, so a 9-hour timer swept hourly (or raced) produces
//       exactly one row. No push, no email, no SMS: this function never
//       imports or calls sendCompliantEmail, sms-dispatch, or apns-send —
//       the notification_log insert below is the entire effect.
//
//   (b) weekly_unlogged — BUILT DARK. Reachable only when the caller is the
//       platform's service-role principal AND the POST body is exactly
//       {"rule":"weekly_unlogged"}. 00614 never schedules that body (its
//       weekly cron.schedule call is a commented-out block) and no profile
//       is opted in by default. See logic.ts's header for the full contract.
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
  RUNNING_TIMER_NUDGE_TYPE,
  type RunningTimerRow,
  runTimeNudges,
  type TimeNudgesPort,
  WEEKLY_UNLOGGED_NUDGE_TYPE,
} from "./logic.ts";

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
        // 23505 = unique_violation: 00614's partial UNIQUE index (D-R1-03)
        // caught a race the pre-check missed — another concurrent sweep (or
        // request) already recorded this exact (user, entry)/(user, week)
        // pair. That IS the idempotency guarantee working, not a failure.
        if (
          (error as { code?: string }).code === "23505"
        ) {
          return;
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

  // D-R1-01 / D-R1-11: verify_jwt=true only proves SOME project-signed JWT
  // was presented — the publishable anon key qualifies. Require the
  // platform's own service-role principal (what invoke_edge_function's cron
  // bridge presents) before either rule runs.
  if (
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

  const body = await readBody(req);
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const port = buildPort(supabase);

  try {
    const result = await runTimeNudges(port, body, new Date());
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
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
