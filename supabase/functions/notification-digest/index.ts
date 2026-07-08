// Supabase Edge Function: notification-digest
//
// Cron-triggered daily at 15:00 UTC (migration 00260). For every CLIENT who set
// reminder_cadence = 'daily_digest', rolls the last 24h of UNREAD non-urgent
// reminders into a SINGLE email instead of the individual nudge emails those
// senders suppressed:
//
//   • proposal-nudge  → notification_log rows (channel in_app, type
//     'proposal_nudge') the sender writes when it skips the direct email.
//   • decision-reminders / expire-decisions → decision_notifications rows
//     (kind decision_required / decision_overdue) fired by the spine RPCs.
//
// Idempotency: a 20h min-interval guard on last_reminder_digest_sent_at
// (isReminderDigestDue) makes a same-day cron retry a no-op; the watermark is
// stamped only after a successful send. Transactional emails are untouched —
// they never route through this preference.
//
// Invoked server-side via invoke_edge_function (service-role bearer), so no CORS
// handling is needed.

// deno-lint-ignore-file no-explicit-any

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendCompliantEmail } from "../_shared/send-email.ts";
import {
  buildReminderDigestEmail,
  isReminderDigestDue,
  type ReminderDigestItem,
} from "./logic.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLIENT_PORTAL_URL =
  Deno.env.get("CLIENT_PORTAL_URL") ?? "https://client.patina.cloud";

// Look-back window for reminders to include. Slightly over 24h so daily runs
// with jitter never drop a row; the min-interval guard prevents double-send.
const WINDOW_MS = 24 * 60 * 60 * 1000;

const PAGE = 200;

interface DigestPrefRow {
  user_id: string;
  last_reminder_digest_sent_at: string | null;
}

async function collectItems(
  supabase: SupabaseClient,
  userId: string,
  sinceIso: string,
): Promise<ReminderDigestItem[]> {
  const items: ReminderDigestItem[] = [];

  // ── Proposal nudges (notification_log in_app rows) ──────────────────────
  const { data: nudges } = await supabase
    .from("notification_log")
    .select("id, metadata, created_at")
    .eq("user_id", userId)
    .eq("channel", "in_app")
    .eq("type", "proposal_nudge")
    .gt("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(50);

  for (const row of (nudges ?? []) as Array<{ metadata: any }>) {
    const meta = row.metadata ?? {};
    if (meta.read_at) continue; // unread only — read-state lives in metadata
    const deepLink = typeof meta.deep_link === "string" ? meta.deep_link : null;
    items.push({
      category: "proposal",
      title: (meta.message as string) || (meta.subject as string) || "A proposal is waiting for your review",
      link: deepLink ? `${CLIENT_PORTAL_URL}${deepLink}` : null,
    });
  }

  // ── Decision reminders (decision_notifications rows) ────────────────────
  const { data: decisions } = await supabase
    .from("decision_notifications")
    .select("id, kind, created_at, decision:client_decisions(title)")
    .eq("user_id", userId)
    .in("kind", ["decision_required", "decision_overdue"])
    .is("read_at", null)
    .gt("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(50);

  for (const row of (decisions ?? []) as Array<{ kind: string; decision: any }>) {
    // Embedded to-one can arrive as an object or a single-element array.
    const dec = Array.isArray(row.decision) ? row.decision[0] : row.decision;
    const title = dec?.title || "A decision needs your input";
    items.push({
      category: "decision",
      title: row.kind === "decision_overdue" ? `${title} (overdue)` : title,
      link: `${CLIENT_PORTAL_URL}/decisions`,
    });
  }

  return items;
}

async function dispatchReminderDigests(
  supabase: SupabaseClient,
): Promise<{ scanned: number; sent: number; empty: number; skipped: number; errors: number }> {
  const stats = { scanned: 0, sent: 0, empty: 0, skipped: 0, errors: 0 };
  const now = new Date();
  const sinceIso = new Date(now.getTime() - WINDOW_MS).toISOString();

  let offset = 0;
  while (true) {
    const { data: prefs, error } = await supabase
      .from("notification_preferences")
      .select("user_id, last_reminder_digest_sent_at")
      .eq("reminder_cadence", "daily_digest")
      .eq("channels_email", true)
      .range(offset, offset + PAGE - 1);

    if (error || !prefs || prefs.length === 0) break;
    stats.scanned += prefs.length;

    for (const pref of prefs as DigestPrefRow[]) {
      try {
        if (!isReminderDigestDue(pref.last_reminder_digest_sent_at, now)) {
          stats.skipped++;
          continue;
        }

        const items = await collectItems(supabase, pref.user_id, sinceIso);
        if (items.length === 0) {
          // Nothing accumulated — leave the watermark so a reminder arriving
          // later today is still picked up on the next run.
          stats.empty++;
          continue;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("email")
          .eq("id", pref.user_id)
          .maybeSingle();
        if (!profile?.email) {
          stats.skipped++;
          continue;
        }

        const { subject, html } = buildReminderDigestEmail(items, CLIENT_PORTAL_URL);
        const result = await sendCompliantEmail(supabase, {
          to: profile.email as string,
          subject,
          html,
          userId: pref.user_id,
          notificationType: "reminder_digest",
          category: "operational",
          templateId: "reminder-digest",
          metadata: { item_count: items.length },
          unsubscribeBaseUrl: CLIENT_PORTAL_URL,
        });

        if (result.success) {
          await supabase
            .from("notification_preferences")
            .update({ last_reminder_digest_sent_at: now.toISOString() })
            .eq("user_id", pref.user_id);
          stats.sent++;
        } else if (result.suppressed) {
          // Suppressed / rate-capped — don't stamp; self-heals on the next run.
          stats.skipped++;
        } else {
          stats.errors++;
        }
      } catch (err) {
        console.error(
          `[notification-digest] failed for user ${pref.user_id}:`,
          err instanceof Error ? err.message : err,
        );
        stats.errors++;
      }
    }

    if (prefs.length < PAGE) break;
    offset += PAGE;
  }

  return stats;
}

Deno.serve(async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  try {
    const stats = await dispatchReminderDigests(supabase);
    console.log(
      `[notification-digest] scanned=${stats.scanned} sent=${stats.sent} empty=${stats.empty} skipped=${stats.skipped} errors=${stats.errors}`,
    );
    return new Response(
      JSON.stringify({ success: true, ...stats, checked_at: new Date().toISOString() }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[notification-digest] fatal:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
