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
import {
  ctaButton,
  escapeHtml,
  muted,
  paragraph,
  portalBaseFor,
  renderBrandedShell,
  signOff,
  type StudioSignOff,
} from "./branded-email.ts";
import { clientDecisionLink } from "./client-portal-links.ts";
import { resolveStudioSignature } from "./studio-identity.ts";

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

export interface ApprovalArtifactCitation {
  kind: "plan_issue" | "spec_book_artifact" | "budget_version";
  version: number;
  checksum: string;
  title: string;
  /** When this edition was issued (project_approval_artifacts.created_at). */
  issuedAt?: string | null;
}

// What a homeowner calls each artifact kind. The enum spelling is a database
// word and never reaches her inbox.
const ARTIFACT_KIND_LABEL: Record<
  ApprovalArtifactCitation["kind"],
  string
> = {
  plan_issue: "plan set",
  spec_book_artifact: "spec book",
  budget_version: "budget",
};

// The promise the first notice makes about the edition attached to it. A
// budget is not drawn and a spec book is not priced, so each kind gets the
// predicate that is true of it.
const ARTIFACT_KIND_PREDICATE: Record<
  ApprovalArtifactCitation["kind"],
  string
> = {
  plan_issue: "exactly as drawn",
  spec_book_artifact: "exactly as specified",
  budget_version: "exactly as priced",
};

export interface DecisionContext {
  id: string;
  title: string | null;
  dueDate: string | null;
  artifact?: ApprovalArtifactCitation | null;
  /** client_decisions.sent_at — the day the studio asked. */
  sentAt?: string | null;
  /**
   * Which register a decision_required letter speaks in. The producer declares
   * it, because no state on the row can be read backwards into it: the only
   * live producer is decision-reminders, whose notice arrives 48 hours before
   * the due date and therefore long after the studio pressed send. It says
   * "reminder", and so does the default — a letter that claims the studio just
   * sent something is a lie unless its producer runs at the moment of sending.
   * A publish-time producer, when one exists, says "first".
   */
  notice?: "first" | "reminder";
}

export interface DeliverDecisionNotificationResult {
  /** True if the in-app spine RPC inserted (or no-op'd) without error. */
  inAppOk: boolean;
  /** True if an email was sent on this call. */
  emailSent: boolean;
  /** True if email was skipped (dedupe / preference / suppression / no recipient). */
  emailSkipped: boolean;
  reason?: string;
  /** Existing email log disposition when delivery was deduplicated. */
  existingLogStatus?: DecisionEmailLogStatus;
}

export type DecisionEmailLogStatus =
  | "queued"
  | "sending"
  | "sent"
  | "delivered"
  | "opened"
  | "clicked"
  | "bounced"
  | "complained"
  | "failed"
  | "suppressed";

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
  return data as unknown as PrefRow;
}

// 'sent' is the post-00552 accept state that sendCompliantEmail writes on
// Resend's 2xx — the ordinary resting state of a delivered-but-unconfirmed
// email. Omitting it classified a genuinely sent email as "no prior email",
// so every re-run of decision-reminders / expire-decisions sent it again. It
// ranks below 'delivered' (weaker evidence) but above 'bounced', mirroring
// where 'sending' sits relative to the in-flight states. 'complained' sits
// with 'suppressed': both are terminal recipient-side outcomes that must
// never be re-attempted.
const EXISTING_EMAIL_STATUS_PRECEDENCE: readonly DecisionEmailLogStatus[] = [
  "clicked",
  "opened",
  "delivered",
  "sent",
  "bounced",
  "complained",
  "suppressed",
  "sending",
  "queued",
];

/**
 * Pick the strongest non-retryable disposition for a prior email attempt.
 * Successful/terminal evidence wins over an in-flight row. Failed attempts
 * are deliberately ignored so the shared sender may retry them.
 */
export function classifyExistingDecisionEmailLogStatuses(
  statuses: readonly string[],
): DecisionEmailLogStatus | null {
  for (const status of EXISTING_EMAIL_STATUS_PRECEDENCE) {
    if (statuses.includes(status)) return status;
  }
  return null;
}

/**
 * Return the prior non-retryable email state for this (decision, kind). This
 * keeps delivery idempotent without collapsing in-flight and terminal states.
 */
async function existingEmailLogStatus(
  supabase: SupabaseClient,
  userId: string | null,
  decisionId: string,
  kind: DecisionNotificationKind,
): Promise<DecisionEmailLogStatus | null> {
  const query = supabase
    .from("notification_log")
    .select("status")
    .eq("type", KIND_TO_LOG_TYPE[kind])
    .eq("channel", "email")
    .neq("status", "failed")
    .contains("metadata", { decisionId });
  if (userId) query.eq("user_id", userId);
  const { data, error } = await query;
  if (error) {
    console.error("decision notification log lookup failed", error);
    return null;
  }
  return classifyExistingDecisionEmailLogStatuses(
    ((data ?? []) as Array<{ status: string }>).map((row) => row.status),
  );
}

interface RenderedEmail {
  subject: string;
  html: string;
}

/**
 * Who the client-facing decision emails come from: the co-brand byline in the
 * shell AND the sign-off at the foot of the letter. Patina never signs a
 * homeowner's mail (R7).
 */
export interface DecisionCobrand extends StudioSignOff {
  studioName?: string;
  studioLogoUrl?: string;
}

/**
 * Resolve the studio that signs a decision's client mail: the brand identity
 * (studio → business name → person, via the canonical RPC) plus the designer's
 * own given name and city. Never throws — an unresolved signature leaves the
 * letter unsigned rather than signing it "Patina".
 */
export async function resolveDecisionSignature(
  supabase: SupabaseClient,
  opts: { designerId?: string | null; projectId?: string | null },
): Promise<DecisionCobrand> {
  return await resolveStudioSignature(supabase, opts);
}

// The zone loadPreferences falls back to, so a weekday printed for a recipient
// with no stored preference matches the one the rest of the rail assumes.
const DEFAULT_TIME_ZONE = "America/New_York";

/** "Thursday" in the recipient's zone, or null when there is no date. */
function weekday(iso: string | null | undefined, timeZone: string): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long" })
    .format(at);
}

/** "October 8" in the recipient's zone, or null when there is no date. */
function calendarDay(
  iso: string | null | undefined,
  timeZone: string,
): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "long",
    day: "numeric",
  }).format(at);
}

/**
 * The designer's copy of the citation: the immutable evidence, checksum and
 * all. This is traceability for the studio, and it stays exactly as it was.
 */
function renderArtifactEvidence(
  artifact: ApprovalArtifactCitation | null | undefined,
): string {
  if (!artifact) return "";
  return [
    paragraph(
      `Approval artifact: <strong style="color:#1F1B16; font-weight:600;">${
        escapeHtml(artifact.title)
      }</strong> ` +
        `(<span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${
          escapeHtml(artifact.kind)
        }</span>, ` +
        `version ${artifact.version}).`,
    ),
    paragraph(
      `SHA-256 checksum: <span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all;">${
        escapeHtml(artifact.checksum)
      }</span>`,
    ),
  ].join("");
}

/**
 * The homeowner's copy of the same citation (R6): which edition, issued when.
 * The hash stays in the record and on the printed Record of Decision — it was
 * never a fact she could act on, and 64 hex characters in a letter read as an
 * error message.
 */
function renderEditionLine(
  artifact: ApprovalArtifactCitation | null | undefined,
  timeZone: string,
): string {
  if (!artifact) return "";
  const issued = calendarDay(artifact.issuedAt, timeZone);
  const line = issued
    ? `Edition ${artifact.version} &middot; issued ${escapeHtml(issued)}`
    : `Edition ${artifact.version}`;
  return muted(line);
}

export function decisionNotificationMetadata(
  kind: DecisionNotificationKind,
  decision: DecisionContext,
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    decisionId: decision.id,
    kind,
  };
  if (decision.artifact) {
    metadata.artifactKind = decision.artifact.kind;
    metadata.artifactVersion = decision.artifact.version;
    metadata.artifactChecksum = decision.artifact.checksum;
    metadata.artifactTitle = decision.artifact.title;
  }
  return metadata;
}

export interface DecisionEmailRenderOptions {
  /** IANA zone the weekday and the date are printed in. */
  timeZone?: string;
}

/**
 * The door in the email (P-01): one bulletproof button onto the approval's own
 * address plus the same address in plain text, for the clients that strip the
 * button. Built through client-portal-links so nobody hand-writes an anchor.
 */
function renderDoor(decisionId: string, label: string): string {
  const url = clientDecisionLink(portalBaseFor("client"), decisionId);
  return [
    ctaButton(url, label),
    muted(
      `Or open it directly: <a href="${url}" style="color:#4E7A66; text-decoration:none;">${
        escapeHtml(url)
      }</a>`,
    ),
  ].join("");
}

export function renderDecisionEmail(
  kind: DecisionNotificationKind,
  recipientName: string,
  decision: DecisionContext,
  cobrand: DecisionCobrand = {},
  options: DecisionEmailRenderOptions = {},
): RenderedEmail {
  const name = recipientName || "there";
  const timeZone = options.timeZone || DEFAULT_TIME_ZONE;
  const decisionTitle = decision.title || "the approval";
  // What she was actually sent, in her words: the artifact's own title when
  // there is one, the decision's title otherwise.
  const title = decision.artifact?.title || decisionTitle;
  const kindLabel = decision.artifact
    ? ARTIFACT_KIND_LABEL[decision.artifact.kind]
    : "approval";
  const studioSignature = signOff(cobrand);
  const asker = (cobrand.designerGivenName ?? "").trim() ||
    (cobrand.studioName ?? "").trim() ||
    "Your designer";

  if (kind === "decision_resolved") {
    // Designer-facing — never co-branded (the designer IS the studio), and the
    // one decision letter Patina still signs.
    const deskUrl = `${portalBaseFor("designer")}/desk`;
    return {
      subject: `Resolved: "${decisionTitle}"`,
      html: renderBrandedShell({
        title: `Resolved: "${decisionTitle}"`,
        preview: `Your client has responded to "${decisionTitle}".`,
        eyebrow: "Resolved",
        audience: "designer",
        body: [
          paragraph(`Hi ${escapeHtml(name)},`),
          paragraph(
            `Your client has responded to the decision <strong style="color:#1F1B16; font-weight:600;">${
              escapeHtml(decisionTitle)
            }</strong>.`,
          ),
          renderArtifactEvidence(decision.artifact),
          ctaButton(deskUrl, "Open your desk"),
          paragraph("— Patina"),
        ].join(""),
      }),
    };
  }

  const editionLine = renderEditionLine(decision.artifact, timeZone);
  const door = renderDoor(decision.id, `Review the ${kindLabel}`);
  const dueWeekday = weekday(decision.dueDate, timeZone);
  const dueDay = calendarDay(decision.dueDate, timeZone);

  if (kind === "decision_overdue") {
    // P-04. No "overdue", no passed-its-date, no gentle nudge: the word she
    // reads is the state she is in, and the studio carries the rest.
    const subject = `Still open: ${title}`;
    const askedOn = calendarDay(decision.sentAt, timeZone);
    const opening = askedOn
      ? `Still open, ${escapeHtml(asker)} asked on ${escapeHtml(askedOn)}.`
      : "Still open.";
    return {
      subject,
      html: renderBrandedShell({
        title: subject,
        preview: "Still open.",
        eyebrow: "Approval",
        audience: "client",
        studioName: cobrand.studioName,
        studioLogoUrl: cobrand.studioLogoUrl,
        body: [
          paragraph(`Hi ${escapeHtml(name)},`),
          paragraph(opening),
          paragraph(
            `<strong style="color:#1F1B16; font-weight:600;">${
              escapeHtml(title)
            }</strong> is waiting for your answer, exactly as it was sent.`,
          ),
          editionLine,
          door,
          studioSignature,
        ].join(""),
      }),
    };
  }

  // decision_required. Two letters, one kind: a first notice announces, a
  // reminder returns. The producer says which; absent that, the letter returns.
  if (decision.notice === "first") {
    const subject = `${asker} sent ${title} for your approval.`;
    const preview = decision.artifact
      ? (dueWeekday
        ? `Edition ${decision.artifact.version}, due ${dueWeekday}.`
        : `Edition ${decision.artifact.version}, ready for your answer.`)
      : (dueWeekday ? `Due ${dueWeekday}.` : "Ready for your answer.");
    return {
      subject,
      html: renderBrandedShell({
        title: subject,
        preview,
        eyebrow: "Approval",
        audience: "client",
        studioName: cobrand.studioName,
        studioLogoUrl: cobrand.studioLogoUrl,
        body: [
          paragraph(`Hi ${escapeHtml(name)},`),
          paragraph(
            `<strong style="color:#1F1B16; font-weight:600;">${
              escapeHtml(title)
            }</strong> ${
              decision.artifact
                ? `is ready, ${ARTIFACT_KIND_PREDICATE[decision.artifact.kind]}.`
                : "is ready for your answer."
            }`,
          ),
          editionLine,
          dueWeekday && dueDay
            ? paragraph(`Due ${escapeHtml(dueWeekday)}, ${escapeHtml(dueDay)}.`)
            : "",
          door,
          studioSignature,
        ].join(""),
      }),
    };
  }

  const subject = dueWeekday ? `${dueWeekday}: ${title}.` : `Still waiting: ${title}.`;
  return {
    subject,
    html: renderBrandedShell({
      title: subject,
      preview: dueWeekday ? `Still open. Due ${dueWeekday}.` : "Still open.",
      eyebrow: "Approval",
      audience: "client",
      studioName: cobrand.studioName,
      studioLogoUrl: cobrand.studioLogoUrl,
      body: [
        paragraph(`Hi ${escapeHtml(name)},`),
        paragraph(
          `<strong style="color:#1F1B16; font-weight:600;">${
            escapeHtml(title)
          }</strong> is still open${
            dueWeekday ? ` and due ${escapeHtml(dueWeekday)}` : ""
          }. Nothing has changed since it was sent.`,
        ),
        editionLine,
        door,
        studioSignature,
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
  // The recipient's zone also decides which weekday her due date is, so it is
  // hoisted out of the gate and handed to the renderer.
  let timeZone = DEFAULT_TIME_ZONE;
  if (recipient.userId) {
    const pref = await loadPreferences(supabase, recipient.userId);
    timeZone = pref.timezone?.trim() || DEFAULT_TIME_ZONE;

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
  const existingLogStatus = await existingEmailLogStatus(
    supabase,
    recipient.userId,
    decision.id,
    kind,
  );
  if (existingLogStatus) {
    return {
      inAppOk: inApp.ok,
      emailSent: false,
      emailSkipped: true,
      reason: "already_sent",
      existingLogStatus,
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
  const rendered = renderDecisionEmail(
    kind,
    recipient.name ?? "",
    decision,
    cobrand,
    { timeZone },
  );
  const result = await sendCompliantEmail(supabase, {
    to: recipient.email,
    subject: rendered.subject,
    html: rendered.html,
    userId: recipient.userId ?? undefined,
    notificationType: KIND_TO_LOG_TYPE[kind],
    category: "operational",
    templateId: `decision-${kind.replace("decision_", "")}`,
    metadata: decisionNotificationMetadata(kind, decision),
  });

  return {
    inAppOk: inApp.ok,
    emailSent: result.success === true,
    emailSkipped: result.success !== true,
    reason: result.success ? undefined : result.error ?? "send_failed",
  };
}
