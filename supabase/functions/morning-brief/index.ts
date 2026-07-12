// Supabase Edge Function: morning-brief (WP-1.3)
//
// Invoked nightly by pg_cron at 11:00 UTC (migration 00302 ->
// invoke_edge_function('morning-brief')), and on-demand from the admin-portal
// "Regenerate" button (api/admin/mission-control/brief/regenerate/route.ts).
// Composes the day's digest — queue counts, yesterday's job runs, marketplace
// vitals deltas (when WP-1.2's get_marketplace_vitals RPC exists), exceptions,
// and today's three highest-priority awaiting_review items — via the pure
// composeBriefContent() in compose.ts, UPSERTs one public.daily_briefs row
// per Chicago calendar date, optionally emails Kody once per date, and writes
// a public.job_runs row recording the invocation.
//
// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  chicagoDateOf,
  chicagoDayBoundsUtc,
  composeBriefContent,
  previousChicagoDate,
  type AgentTaskRow,
  type BriefContent,
  type JobRunRow,
  type QueueStatRow,
} from "./compose.ts";
import { renderBriefEmailHtml } from "./render.ts";
import { sendCompliantEmail } from "../_shared/send-email.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const TASK_COLUMNS =
  "id, task_type, status, priority, assignee, summary, flagged_stale_at, last_error, created_at, started_at, completed_at";

Deno.serve(async (_req: Request) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // ─── job_runs bookkeeping: open the run row first (00300 idiom — this
  // function is its own writer since it has no SECURITY DEFINER RPC of its
  // own; the service-role client bypasses RLS same as groom_agent_tasks). ──
  const { data: runRow } = await supabase
    .from("job_runs")
    .insert({ job_name: "morning-brief", status: "running" })
    .select("id")
    .single();
  const runId = runRow?.id as number | undefined;

  try {
    const now = new Date();
    const briefDate = chicagoDateOf(now);
    const yesterday = previousChicagoDate(briefDate);
    const { startUtc, endUtc } = chicagoDayBoundsUtc(yesterday);

    // ─── Queue counts (SECURITY DEFINER RPC, service_role-only — 00297) ────
    const { data: queueData, error: queueErr } = await supabase.rpc("agent_queue_stats");
    if (queueErr) throw new Error(`agent_queue_stats failed: ${queueErr.message}`);
    const queue = (queueData ?? []) as QueueStatRow[];

    // ─── Yesterday's job_runs ────────────────────────────────────────────
    const { data: jobRunsData, error: jobRunsErr } = await supabase
      .from("job_runs")
      .select("job_name, status, started_at, finished_at, error, cost_usd")
      .gte("started_at", startUtc)
      .lt("started_at", endUtc);
    if (jobRunsErr) throw new Error(`job_runs query failed: ${jobRunsErr.message}`);
    const jobRuns = (jobRunsData ?? []) as JobRunRow[];

    // ─── Yesterday's job:% agent_tasks (headless-job completions) ──────────
    const { data: jobTasksData, error: jobTasksErr } = await supabase
      .from("agent_tasks")
      .select(TASK_COLUMNS)
      .like("task_type", "job:%")
      .gte("completed_at", startUtc)
      .lt("completed_at", endUtc);
    if (jobTasksErr) throw new Error(`job tasks query failed: ${jobTasksErr.message}`);
    const jobTasks = (jobTasksData ?? []) as AgentTaskRow[];

    // ─── Exceptions ──────────────────────────────────────────────────────
    // Stale = flagged by queue-groom (00300) and still awaiting review — a
    // task flagged stale that has since been approved/rejected is no longer
    // an outstanding exception, so the status filter matters here.
    const { data: staleData, error: staleErr } = await supabase
      .from("agent_tasks")
      .select(TASK_COLUMNS)
      .not("flagged_stale_at", "is", null)
      .eq("status", "awaiting_review")
      .order("flagged_stale_at", { ascending: true })
      .limit(50);
    if (staleErr) throw new Error(`stale tasks query failed: ${staleErr.message}`);

    const { data: failedData, error: failedErr } = await supabase
      .from("agent_tasks")
      .select(TASK_COLUMNS)
      .eq("status", "failed")
      .order("completed_at", { ascending: false })
      .limit(50);
    if (failedErr) throw new Error(`failed tasks query failed: ${failedErr.message}`);

    const { data: intakeData, error: intakeErr } = await supabase
      .from("agent_tasks")
      .select(TASK_COLUMNS)
      .eq("task_type", "intake_error")
      .eq("status", "awaiting_review")
      .order("created_at", { ascending: false })
      .limit(50);
    if (intakeErr) throw new Error(`intake_error tasks query failed: ${intakeErr.message}`);

    // ─── Today's three: top 3 awaiting_review by priority, created_at ──────
    const { data: threeData, error: threeErr } = await supabase
      .from("agent_tasks")
      .select(TASK_COLUMNS)
      .eq("status", "awaiting_review")
      .order("priority", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(3);
    if (threeErr) throw new Error(`today's three query failed: ${threeErr.message}`);

    // ─── Vitals (WP-1.2, ships concurrently — RPC may not exist yet) ───────
    let vitalsCurrent: Record<string, unknown> | null = null;
    try {
      // get_marketplace_vitals is not yet in the checked-in generated types
      // (WP-1.2 lands it separately) — narrow, defensive cast.
      const { data, error } = await (supabase as any).rpc("get_marketplace_vitals");
      if (error) throw error;
      vitalsCurrent = Array.isArray(data) ? (data[0] ?? null) : (data ?? null);
    } catch (e) {
      console.warn("morning-brief: get_marketplace_vitals unavailable, omitting vitals section", e);
      vitalsCurrent = null;
    }

    let vitalsPrevious: Record<string, unknown> | null = null;
    if (vitalsCurrent) {
      // daily_briefs is not yet in the checked-in generated types either
      // (this migration adds it) — narrow, defensive cast + shape check.
      const { data: prevRow } = await (supabase as any)
        .from("daily_briefs")
        .select("content")
        .lt("brief_date", briefDate)
        .order("brief_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      const prevContent = prevRow?.content as BriefContent | undefined;
      vitalsPrevious = prevContent?.vitals?.current ?? null;
    }

    // ─── Compose (pure) ──────────────────────────────────────────────────
    const content = composeBriefContent({
      briefDate,
      now,
      queue,
      jobRuns,
      jobTasks,
      staleTasks: (staleData ?? []) as AgentTaskRow[],
      failedTasks: (failedData ?? []) as AgentTaskRow[],
      intakeErrorTasks: (intakeData ?? []) as AgentTaskRow[],
      todaysThreeTasks: (threeData ?? []) as AgentTaskRow[],
      vitalsCurrent,
      vitalsPrevious,
    });

    // ─── UPSERT — email_sent_at is deliberately absent from this payload so
    // PostgREST's ON CONFLICT DO UPDATE SET clause never touches it; a
    // same-day regenerate refreshes content/generated_at but preserves the
    // "already emailed" watermark. ──────────────────────────────────────────
    const { data: upserted, error: upsertErr } = await (supabase as any)
      .from("daily_briefs")
      .upsert(
        { brief_date: briefDate, content, generated_at: new Date().toISOString() },
        { onConflict: "brief_date" },
      )
      .select("brief_date, content, generated_at, email_sent_at")
      .single();
    if (upsertErr) throw new Error(`daily_briefs upsert failed: ${upsertErr.message}`);

    // ─── Optional email — internal recipient only (Kody), the one permitted
    // automated send. Sends at most once per brief_date. ────────────────────
    const emailTo = Deno.env.get("MORNING_BRIEF_EMAIL_TO");
    let emailAttempted = false;
    let emailSent = false;
    if (emailTo && !upserted?.email_sent_at) {
      emailAttempted = true;
      const html = renderBriefEmailHtml(content, briefDate);
      const result = await sendCompliantEmail(supabase, {
        to: emailTo,
        subject: `Morning Brief — ${briefDate}`,
        html,
        category: "operational",
        notificationType: "morning_brief",
      });
      if (result.success) {
        emailSent = true;
        await (supabase as any)
          .from("daily_briefs")
          .update({ email_sent_at: new Date().toISOString() })
          .eq("brief_date", briefDate);
      } else {
        console.error("morning-brief: email send failed", result.error);
      }
    }

    const detail = {
      brief_date: briefDate,
      queue_statuses: queue.length,
      runs_yesterday: content.runs_yesterday.length,
      exceptions_stale: content.exceptions.stale.length,
      exceptions_failed: content.exceptions.failed.length,
      exceptions_intake_errors: content.exceptions.intake_errors.length,
      todays_three: content.todays_three.length,
      vitals_present: !!content.vitals,
      email_attempted: emailAttempted,
      email_sent: emailSent,
    };

    if (runId != null) {
      await supabase
        .from("job_runs")
        .update({ status: "succeeded", finished_at: new Date().toISOString(), detail })
        .eq("id", runId);
    }

    return new Response(JSON.stringify({ success: true, ...detail }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("morning-brief failed:", err);
    const message = err instanceof Error ? err.message : String(err);
    if (runId != null) {
      await supabase
        .from("job_runs")
        .update({ status: "failed", finished_at: new Date().toISOString(), error: message })
        .eq("id", runId);
    }
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
