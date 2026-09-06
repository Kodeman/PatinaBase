// Supabase Edge Function: notification-digest
//
// Cron-triggered hourly at 20 past (migration 00572, replacing 00278's daily
// 15:00 UTC run so the per-reader 8am-local gate has an hour to release into).
// For every CLIENT on a BATCHING cadence — 'daily', or 'weekly_sunday' on a Sunday in her own zone
// (00572) — rolls the window's UNREAD non-urgent reminders into a SINGLE email
// instead of the individual nudge emails those senders suppressed:
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
  artifactCitationsForDigest,
  buildReminderDigestEmail,
  decisionDigestLink,
  decisionDigestTitle,
  type DigestPeriod,
  digestCategoryForDecision,
  type DirectDecisionMailRow,
  directlyMailedDecisionIds,
  digestWindowStart,
  dropDecisionsPastOverdue,
  dropDirectlyMailedDecisions,
  dropSnoozedDecisions,
  isDigestDue,
  type ReminderDigestItem,
} from "./logic.ts";
import { isSnoozeActive } from "../_shared/decision-notify.ts";
import {
  type EmbeddedApprovalArtifact,
  resolveApprovalArtifactCitation,
  toOne,
} from "../_shared/project-approval-notification.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLIENT_PORTAL_URL = Deno.env.get("CLIENT_PORTAL_URL") ??
  "https://client.patina.cloud";

const PAGE = 200;

interface DigestPrefRow {
  user_id: string;
  last_reminder_digest_sent_at: string | null;
  timezone: string | null;
  reminder_cadence: string | null;
}

/**
 * R16. The approvals this reader has already had the overdue notice for. After
 * that notice Patina is quiet about them, in a summary as much as in a letter.
 */
async function decisionsPastOverdue(
  supabase: SupabaseClient,
  userId: string,
  decisionIds: string[],
): Promise<string[]> {
  if (decisionIds.length === 0) return [];
  const { data, error } = await supabase
    .from("decision_notifications")
    .select("decision_id")
    .eq("user_id", userId)
    .eq("kind", "decision_overdue")
    .in("decision_id", decisionIds);
  if (error) {
    console.warn("[notification-digest] overdue lookup failed", error);
    return [];
  }
  return ((data ?? []) as Array<{ decision_id: string }>)
    .map((row) => row.decision_id);
}

/**
 * P-28 (r1 B1). The approvals this reader has told Patina to hold, and the
 * hour each hold ends. A snoozed approval sends nothing until then — in a
 * summary as much as in a letter — except the two notices R16 exempts, neither
 * of which is ever batched here.
 *
 * Fails open, exactly as the direct-mail gate does: a snooze that cannot be
 * read must not become a silence nobody asked for.
 */
async function snoozedDecisions(
  supabase: SupabaseClient,
  userId: string,
  decisionIds: string[],
  now: Date,
): Promise<string[]> {
  if (decisionIds.length === 0) return [];
  const { data, error } = await supabase
    .from("decision_snoozes")
    .select("decision_id, snoozed_until")
    .eq("user_id", userId)
    .in("decision_id", decisionIds);
  if (error) {
    console.warn("[notification-digest] snooze lookup failed", error);
    return [];
  }
  return ((data ?? []) as Array<
    { decision_id: string; snoozed_until: string | null }
  >)
    .filter((row) => isSnoozeActive(row.snoozed_until, now))
    .map((row) => row.decision_id);
}

/**
 * The approvals that already had a letter of their own inside this window
 * (r2 M-R2-02). The first notice and a superseding edition break the digest
 * and mail direct, so without this the default cadence says the same thing
 * twice inside a day: the announcement in the afternoon, the summary the next
 * morning. ux/03 §282 allows one.
 *
 * Fails open — a log that cannot be read must not become a silence. The
 * duplicate is the lesser harm than a summary that never mentions the ask.
 */
async function decisionsMailedDirect(
  supabase: SupabaseClient,
  userId: string,
  decisionIds: string[],
  sinceIso: string,
): Promise<string[]> {
  if (decisionIds.length === 0) return [];
  const { data, error } = await supabase
    .from("notification_log")
    .select("status, metadata")
    .eq("user_id", userId)
    .eq("channel", "email")
    .eq("type", "decision_required")
    .gt("created_at", sinceIso)
    .limit(200);
  if (error) {
    console.warn("[notification-digest] direct-mail lookup failed", error);
    return [];
  }
  const wanted = new Set(decisionIds);
  return directlyMailedDecisionIds(
    (data ?? []) as DirectDecisionMailRow[],
  ).filter((id) => wanted.has(id));
}

async function collectItems(
  supabase: SupabaseClient,
  userId: string,
  sinceIso: string,
  now: Date,
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
      title: (meta.message as string) || (meta.subject as string) ||
        "A proposal is waiting for your review",
      link: deepLink ? `${CLIENT_PORTAL_URL}${deepLink}` : null,
    });
  }

  // ── Decision reminders (decision_notifications rows) ────────────────────
  // decision_required only. The overdue notice always breaks the digest and
  // mails direct (R16, _shared/decision-notify.ts), so batching it here would
  // say the same thing twice — and it is the one letter that must not wait.
  const { data: decisions } = await supabase
    .from("decision_notifications")
    .select(`
      id, user_id, kind, created_at,
      decision:client_decisions(
        id, title, project_id, approval_contract,
        approval_artifact:project_approval_artifacts(
          source_kind, source_version, artifact_hash, artifact_title, created_at
        ),
        authority_snapshot:project_decision_authority_snapshots(
          decision_lead_id
        )
      )
    `)
    .eq("user_id", userId)
    .eq("kind", "decision_required")
    .is("read_at", null)
    .gt("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(50);

  for (
    const row of (decisions ?? []) as Array<{
      user_id: string;
      kind: string;
      decision: any;
    }>
  ) {
    // Embedded to-one can arrive as an object or a single-element array.
    const dec = Array.isArray(row.decision) ? row.decision[0] : row.decision;
    const isStage2 = dec?.approval_contract === "project_artifact_v1";
    const artifact = isStage2
      ? resolveApprovalArtifactCitation(
        dec?.approval_artifact as
          | EmbeddedApprovalArtifact
          | EmbeddedApprovalArtifact[]
          | null,
      )
      : null;
    const snapshot = toOne(
      dec?.authority_snapshot as
        | { decision_lead_id: string | null }
        | Array<{ decision_lead_id: string | null }>
        | null,
    );
    if (
      isStage2 &&
      (!artifact || snapshot?.decision_lead_id !== row.user_id)
    ) {
      console.error(
        "[notification-digest] Stage-2 item failed frozen evidence check",
        dec?.id,
      );
      continue;
    }
    const title = dec?.title || "Something needs your answer";
    items.push({
      category: digestCategoryForDecision(dec?.approval_contract),
      title: decisionDigestTitle(row.kind, title),
      // The same address the decision letter's own door carries: the iOS app
      // claims /decisions/*, and the portal middleware 308s everyone else onto
      // the ask's anchor. One approval, one address across the whole inbox.
      link: decisionDigestLink(CLIENT_PORTAL_URL, dec?.id),
      decisionId: dec?.id,
      artifact,
    });
  }

  const decisionIds = items.flatMap((item) =>
    item.decisionId ? [item.decisionId] : []
  );
  return dropDirectlyMailedDecisions(
    dropSnoozedDecisions(
      dropDecisionsPastOverdue(
        items,
        await decisionsPastOverdue(supabase, userId, decisionIds),
      ),
      await snoozedDecisions(supabase, userId, decisionIds, now),
    ),
    await decisionsMailedDirect(supabase, userId, decisionIds, sinceIso),
  );
}

async function dispatchReminderDigests(
  supabase: SupabaseClient,
): Promise<
  {
    scanned: number;
    sent: number;
    empty: number;
    skipped: number;
    errors: number;
  }
> {
  const stats = { scanned: 0, sent: 0, empty: 0, skipped: 0, errors: 0 };
  const now = new Date();

  let offset = 0;
  while (true) {
    // Both batching cadences page through here (00572). 'right_away' never
    // does: her reminders mail as they fire and there is nothing to summarise.
    const { data: prefs, error } = await supabase
      .from("notification_preferences")
      .select(
        "user_id, last_reminder_digest_sent_at, timezone, reminder_cadence",
      )
      .in("reminder_cadence", ["daily", "weekly_sunday"])
      .eq("channels_email", true)
      .range(offset, offset + PAGE - 1);

    if (error || !prefs || prefs.length === 0) break;
    stats.scanned += prefs.length;

    for (const pref of prefs as DigestPrefRow[]) {
      try {
        const period: DigestPeriod = pref.reminder_cadence === "weekly_sunday"
          ? "weekly_sunday"
          : "daily";
        const zone = pref.timezone?.trim() || "America/New_York";
        // "Once a week, on Sunday" is Sunday in her zone; six of the seven
        // daily runs are a no-op for her.
        if (
          !isDigestDue(period, pref.last_reminder_digest_sent_at, now, zone)
        ) {
          stats.skipped++;
          continue;
        }

        // One period back, or as far as the last summary actually sent when
        // a run was skipped — a daily reader is never mailed on Sunday, and
        // Saturday's reminders must not fall through that gap (r1 M3).
        const sinceIso = digestWindowStart(
          period,
          pref.last_reminder_digest_sent_at,
          now,
        ).toISOString();
        const items = await collectItems(supabase, pref.user_id, sinceIso, now);
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

        const { subject, html } = buildReminderDigestEmail(
          items,
          CLIENT_PORTAL_URL,
          pref.timezone,
          period,
        );
        const result = await sendCompliantEmail(supabase, {
          to: profile.email as string,
          subject,
          html,
          userId: pref.user_id,
          notificationType: "reminder_digest",
          category: "operational",
          templateId: "reminder-digest",
          metadata: {
            item_count: items.length,
            artifactCitations: artifactCitationsForDigest(items),
          },
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
      JSON.stringify({
        success: true,
        ...stats,
        checked_at: new Date().toISOString(),
      }),
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
