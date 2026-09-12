// Supabase Edge Function: time-nudges
//
// HT-34 (hour-tracking program, W4 / lane D). Cron-invoked hourly via
// public.invoke_edge_function (00614: 'time-nudges-hourly', service-role
// bearer + apikey from Vault, 00258's invoke_edge_function/app_setting
// pattern) — same cron->edge bridge as decision-reminders/field-daily/
// morning-brief. verify_jwt = true is the platform default (explicit in
// config.toml for intent, matching those functions); neither the cron path
// nor any other caller can reach this function without a valid Supabase JWT,
// and the function does not need to resolve caller identity beyond that — it
// reads no per-caller scope and writes only quiet, idempotent in-app rows, so
// there is no in-code service-role check to get wrong (contrast client-invite,
// which names an arbitrary writer/signer and therefore DOES assert
// role === 'service_role' in code). No CORS: never browser-called.
//
// Two rules, one reachable:
//
//   (a) running_timer  — LIVE. A running timer (duration_minutes IS NULL)
//       started more than 8 hours ago gets exactly one quiet Record row
//       (notification_log, channel='in_app') per sweep-cycle — idempotent
//       per (user_id, entry_id), so a 9-hour timer swept hourly produces
//       exactly one row across nine sweeps. No push, no email, no SMS: this
//       function never imports or calls sendCompliantEmail, sms-dispatch, or
//       apns-send — the notification_log insert below is the entire effect.
//
//   (b) weekly_unlogged — BUILT DARK. Reachable only when the POST body is
//       exactly {"rule":"weekly_unlogged"}. 00614 never schedules that body
//       (its weekly cron.schedule call is a commented-out block), so in prod
//       this arm never runs. See logic.ts's header for the full contract.
//
// All decisions and every dedupe check live in logic.ts, tested without a
// live Postgres via the TimeNudgesPort fake (deno suite: index.test.ts).

import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2";
import {
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
      if (error) throw error;
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
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const port = buildPort(supabase);

  try {
    const result = await runTimeNudges(port, body, new Date());
    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const detail =
      err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error("time-nudges: run failed", detail);
    return new Response(JSON.stringify({ error: "internal_error", detail }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
