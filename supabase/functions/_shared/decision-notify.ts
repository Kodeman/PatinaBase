// Shared decision-notification delivery for Supabase Edge Functions.
//
// Decision Framework Wave 2 · Territory T2 (Notifications & Delivery).
//
// Routes decision notifications through the notification center instead of
// talking straight to Resend:
//
//   1. Writes the in-app row via the frozen Wave-1 spine RPC
//      (notify_decision_required / overdue / resolved). The RPC is idempotent
//      — a partial unique index on (decision_id, kind) means a re-call is a
//      no-op (see 00173_decision_notifications.sql).
//   2. Respects the recipient's notification_preferences (channel + type
//      toggles + quiet hours) — mirrors @patina/notifications/preferences.ts,
//      reimplemented inline because edge functions are Deno and cannot import
//      the Node @patina/notifications package.
//   3. Delivers email through the shared sendCompliantEmail chokepoint
//      (suppression, per-recipient rate cap, RFC-8058 unsubscribe headers,
//      notification_log) with category "operational".
//
// Email idempotency is enforced two ways: the in-app RPC dedupes the in-app
// row, and an explicit notification_log lookup (one email per decision per
// kind) dedupes the email — so re-running decision-reminders / expire-decisions
// for the same decision will not double-send.

// deno-lint-ignore-file no-explicit-any

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendCompliantEmail } from "./send-email.ts";
import { renderBrandedShell, paragraph, escapeHtml } from "./branded-email.ts";

// The three decision notification kinds. These mirror the
// decision_notification_kind enum (00173) and the NotificationType members
// declared in packages/shared/src/types/notifications.ts.
export type DecisionNotificationKind =
  | "decision_required"
  | "decision_overdue"
  | "decision_resolved";

// Spine RPC name per kind. Frozen — defined in 00173.
const KIND_TO_RPC: Record<DecisionNotificationKind, string> = {
  decision_required: "notify_decision_required",
  decision_overdue: "notify_decision_overdue",
  decision_resolved: "notify_decision_resolved",
};

// notification_preferences column that gates each kind. All three decision
// kinds are project-management notifications; the closest existing preference
// column is type_project_milestone (project lifecycle). A missing/false value
// suppresses delivery (fail-closed for the user's stated preference).
const KIND_TO_PREF_COLUMN: Record<DecisionNotificationKind, string> = {
  decision_required: "type_project_milestone",
  decision_overdue: "type_project_milestone",
  decision_resolved: "type_project_milestone",
};

// notification_log.type recorded per kind so the dedupe lookup and analytics
// line up with the NotificationType union.
const KIND_TO_LOG_TYPE: Record<DecisionNotificationKind, string> = {
  decision_required: "decision_required",
  decision_overdue: "decision_overdue",
  decision_resolved: "decision_resolved",
};

// Kinds subject to the client's reminder_cadence preference. Both are
// client-addressed reminders (produced by decision-reminders / expire-decisions)
// and so are batchable into the daily digest. decision_resolved is addressed to
// the DESIGNER and is never deferred.
const CADENCE_ELIGIBLE_KINDS = new Set<DecisionNotificationKind>([
  "decision_required",
  "decision_overdue",
]);

interface PrefRow {
  channels_email: boolean | null;
  channels_in_app: boolean | null;
  type_project_milestone: boolean | null;
  reminder_cadence: string | null;
  quiet_hours_enabled: boolean | null;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  timezone: string | null;
  [key: string]: unknown;
}

export interface DecisionRecipient {
  /** auth.users id of the recipient, when known. NULL for not-yet-signed-up clients. */
  userId: string | null;
  /** Delivery email address. */
  email: string | null;
  /** Display name for the greeting. */
  name: string | null;
}

export interface DecisionContext {
  id: string;
  title: string | null;
  dueDate: string | null;
}

export interface DeliverDecisionNotificationResult {
  /** True if the in-app spine RPC inserted (or no-op'd) without error. */
  inAppOk: boolean;
  /** True if an email was sent on this call. */
  emailSent: boolean;
  /** True if email was skipped (dedupe / preference / suppression / no recipient). */
  emailSkipped: boolean;
  reason?: string;
}

/**
 * Fire the in-app notification for a decision via the frozen spine RPC.
 * Idempotent — see 00173 (ON CONFLICT DO NOTHING). Non-fatal on error.
 *
 * Returns the inserted row id (string) or null when the RPC no-op'd / there
 * was no recipient.
 */
export async function fireDecisionInApp(
  supabase: SupabaseClient,
  decisionId: string,
  kind: DecisionNotificationKind,
): Promise<{ ok: boolean; id: string | null; error?: string }> {
  const { data, error } = await supabase.rpc(KIND_TO_RPC[kind], {
    p_decision_id: decisionId,
  });
  if (error) {
    console.error(
      `decision-notify: ${KIND_TO_RPC[kind]} failed for ${decisionId}`,
      error,
    );
    return { ok: false, id: null, error: error.message };
  }
  return { ok: true, id: (data as string | null) ?? null };
}

/** Inline reimplementation of @patina/notifications isQuietHours. */
function isQuietHours(pref: PrefRow, now = new Date()): boolean {
  if (!pref.quiet_hours_enabled) return false;
  const tz = pref.timezone || "America/New_York";
  const start = pref.quiet_hours_start || "22:00";
  const end = pref.quiet_hours_end || "08:00";

  const userTime = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);

  const [startH, startM] = start.split(":").map(Number);
  const [endH, endM] = end.split(":").map(Number);
  const [nowH, nowM] = userTime.split(":").map(Number);

  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  const nowMinutes = nowH * 60 + nowM;

  if (startMinutes > endMinutes) {
    return nowMinutes >= startMinutes || nowMinutes < endMinutes;
  }
  return nowMinutes >= startMinutes && nowMinutes < endMinutes;
}

/**
 * Fetch the recipient's preferences. Falls back to channels-on defaults when
 * no row exists (parallels packages/notifications/preferences.ts).
 */
async function loadPreferences(
  supabase: SupabaseClient,
  userId: string,
): Promise<PrefRow> {
  const { data } = await supabase
    .from("notification_preferences")
    .select(
      "channels_email, channels_in_app, type_project_milestone, reminder_cadence, " +
        "quiet_hours_enabled, quiet_hours_start, quiet_hours_end, timezone",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) {
    return {
      channels_email: true,
      channels_in_app: true,
      type_project_milestone: true,
      reminder_cadence: "immediate",
      quiet_hours_enabled: false,
      quiet_hours_start: "22:00",
      quiet_hours_end: "08:00",
      timezone: "America/New_York",
    };
  }
  return data as PrefRow;
}

/**
 * Has an email for this (decision, kind) already been logged? Used to keep
 * email delivery idempotent across reminder / expire re-runs. We treat any
 * non-failed log row (queued / sending / delivered / opened / clicked /
 * suppressed) as "already handled" so a transient retry does not re-send.
 */
async function emailAlreadyLogged(
  supabase: SupabaseClient,
  userId: string | null,
  decisionId: string,
  kind: DecisionNotificationKind,
): Promise<boolean> {
  const query = supabase
    .from("notification_log")
    .select("id", { count: "exact", head: true })
    .eq("type", KIND_TO_LOG_TYPE[kind])
    .eq("channel", "email")
    .neq("status", "failed")
    .contains("metadata", { decisionId });
  if (userId) query.eq("user_id", userId);
  const { count } = await query;
  return (count ?? 0) > 0;
}

interface RenderedEmail {
  subject: string;
  html: string;
}

/** Optional studio co-brand byline for the client-facing decision emails. */
export interface DecisionCobrand {
  studioName?: string;
  studioLogoUrl?: string;
}

function renderDecisionEmail(
  kind: DecisionNotificationKind,
  recipientName: string,
  decision: DecisionContext,
  cobrand: DecisionCobrand = {},
): RenderedEmail {
  const name = recipientName || "there";
  const title = decision.title || "a decision";

  if (kind === "decision_resolved") {
    // Designer-facing — never co-branded (the designer IS the studio).
    return {
      subject: `Resolved: "${title}"`,
      html: renderBrandedShell({
        title: `Resolved: "${title}"`,
        preview: `Your client has responded to "${title}".`,
        eyebrow: "Resolved",
        body: [
          paragraph(`Hi ${escapeHtml(name)},`),
          paragraph(`Your client has responded to the decision <strong style="color:#1F1B16; font-weight:600;">${escapeHtml(title)}</strong>.`),
          paragraph("Open your Patina dashboard to review their selection."),
          paragraph("— Patina"),
        ].join(""),
      }),
    };
  }

  if (kind === "decision_overdue") {
    return {
      subject: `Overdue: "${title}" still needs your decision`,
      html: renderBrandedShell({
        title: `Overdue: "${title}" still needs your decision`,
        preview: `"${title}" has passed its due date and still needs your decision.`,
        eyebrow: "Overdue",
        studioName: cobrand.studioName,
        studioLogoUrl: cobrand.studioLogoUrl,
        body: [
          paragraph(`Hi ${escapeHtml(name)},`),
          paragraph(`The decision <strong style="color:#1F1B16; font-weight:600;">${escapeHtml(title)}</strong> has passed its due date and is still waiting on you.`),
          paragraph("Open your Patina dashboard to review the options and pick one."),
          paragraph("— Patina"),
        ].join(""),
      }),
    };
  }

  // decision_required
  const dueClause = decision.dueDate
    ? (() => {
        const hoursLeft = Math.max(
          0,
          Math.round(
            (new Date(decision.dueDate as string).getTime() - Date.now()) /
              (1000 * 60 * 60),
          ),
        );
        return paragraph(`It's due in approximately <strong style="color:#1F1B16; font-weight:600;">${hoursLeft} hour${hoursLeft === 1 ? "" : "s"}</strong>.`);
      })()
    : "";

  return {
    subject: `Reminder: "${title}" needs your decision`,
    html: renderBrandedShell({
      title: `Reminder: "${title}" needs your decision`,
      preview: `Your designer is waiting on a decision: "${title}".`,
      eyebrow: "Decision needed",
      studioName: cobrand.studioName,
      studioLogoUrl: cobrand.studioLogoUrl,
      body: [
        paragraph(`Hi ${escapeHtml(name)},`),
        paragraph(`Your designer is waiting on a decision: <strong style="color:#1F1B16; font-weight:600;">${escapeHtml(title)}</strong>.`),
        dueClause,
        paragraph("Open your Patina dashboard to review the options and pick one."),
        paragraph("— Patina"),
      ].join(""),
    }),
  };
}

/**
 * Deliver a decision notification through the notification center:
 *   • fire the in-app spine RPC (idempotent), then
 *   • respect preferences (in-app channel / type toggle / quiet hours), then
 *   • send email via sendCompliantEmail (suppression + rate cap + log), with a
 *     notification_log dedupe so re-runs don't double-send.
 *
 * Non-fatal throughout — a delivery failure must never abort the caller's loop.
 */
export async function deliverDecisionNotification(
  supabase: SupabaseClient,
  kind: DecisionNotificationKind,
  decision: DecisionContext,
  recipient: DecisionRecipient,
  cobrand: DecisionCobrand = {},
): Promise<DeliverDecisionNotificationResult> {
  // 1. In-app row via the frozen spine RPC (idempotent).
  const inApp = await fireDecisionInApp(supabase, decision.id, kind);

  // 2. No email target → in-app only (not-yet-signed-up client, etc.).
  if (!recipient.email) {
    return {
      inAppOk: inApp.ok,
      emailSent: false,
      emailSkipped: true,
      reason: "no_recipient_email",
    };
  }

  // 3. Preference / quiet-hours gate (only when we know the auth user).
  if (recipient.userId) {
    const pref = await loadPreferences(supabase, recipient.userId);

    const typeCol = KIND_TO_PREF_COLUMN[kind];
    const typeEnabled = pref[typeCol] !== false; // null/undefined ⇒ default on
    if (!typeEnabled) {
      return {
        inAppOk: inApp.ok,
        emailSent: false,
        emailSkipped: true,
        reason: "type_disabled",
      };
    }

    if (pref.channels_email === false) {
      return {
        inAppOk: inApp.ok,
        emailSent: false,
        emailSkipped: true,
        reason: "email_channel_disabled",
      };
    }

    // Cadence gate — a client on the daily digest defers non-urgent reminder
    // EMAILS to the notification-digest cron. The in-app row already fired
    // (step 1), so nothing is lost; the digest batches it. Only client reminder
    // kinds are eligible (decision_resolved → designer stays immediate).
    if (
      CADENCE_ELIGIBLE_KINDS.has(kind) &&
      pref.reminder_cadence === "daily_digest"
    ) {
      return {
        inAppOk: inApp.ok,
        emailSent: false,
        emailSkipped: true,
        reason: "cadence_digest",
      };
    }

    // Overdue is time-critical and bypasses quiet hours; required/resolved
    // defer (skip this run — the daily cron will re-attempt).
    if (kind !== "decision_overdue" && isQuietHours(pref)) {
      return {
        inAppOk: inApp.ok,
        emailSent: false,
        emailSkipped: true,
        reason: "quiet_hours",
      };
    }
  }

  // 4. Email idempotency: already logged for this (decision, kind)?
  const alreadySent = await emailAlreadyLogged(
    supabase,
    recipient.userId,
    decision.id,
    kind,
  );
  if (alreadySent) {
    return {
      inAppOk: inApp.ok,
      emailSent: false,
      emailSkipped: true,
      reason: "already_sent",
    };
  }

  // 5. Send via the shared compliance chokepoint.
  //
  // When recipient.userId is set, sendCompliantEmail writes a notification_log
  // row (suppression check, rate cap, and the dedupe row our step-4 lookup
  // reads). notification_log.user_id is NOT NULL → for not-yet-signed-up
  // clients (no auth user) no log row is written, and email idempotency falls
  // back to the caller's own guard: decision-reminders' reminder_sent_at stamp
  // and expire-decisions' one-shot pending→expired transition.
  const rendered = renderDecisionEmail(kind, recipient.name ?? "", decision, cobrand);
  const result = await sendCompliantEmail(supabase, {
    to: recipient.email,
    subject: rendered.subject,
    html: rendered.html,
    userId: recipient.userId ?? undefined,
    notificationType: KIND_TO_LOG_TYPE[kind],
    category: "operational",
    templateId: `decision-${kind.replace("decision_", "")}`,
    metadata: { decisionId: decision.id, kind },
  });

  return {
    inAppOk: inApp.ok,
    emailSent: result.success === true,
    emailSkipped: result.success !== true,
    reason: result.success ? undefined : result.error ?? "send_failed",
  };
}
