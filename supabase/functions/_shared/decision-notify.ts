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
// row, and an explicit notification_log lookup dedupes the email — so
// re-running decision-first-notice / decision-reminders / expire-decisions for
// the same decision will not double-send. The lookup keys on the decision AND,
// for decision_required, on the register: a first notice and a reminder are two
// letters in one cadence, and neither may swallow the other.

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

// P-28 (00572). The three cadences, in the column's own spellings. The two
// retired ones are normalised here as well as by the database trigger, because
// a preferences row written by yesterday's portal reaches this code before the
// trigger has had anything to say about it.
export type ReminderCadence = "right_away" | "daily" | "weekly_sunday";

export function normalizeReminderCadence(
  value: string | null | undefined,
): ReminderCadence {
  switch ((value ?? "").trim()) {
    case "daily":
    case "daily_digest":
      return "daily";
    case "weekly_sunday":
      return "weekly_sunday";
    case "right_away":
    case "immediate":
      return "right_away";
    default:
      // The column default is 'daily' (00572): the quietest cadence that still
      // gets a real answer on time, because the first notice and the overdue
      // notice both break the digest.
      return "daily";
  }
}

/**
 * The recipient's own standing settings, which hold a letter for reasons that
 * have nothing to do with cadence: a type switched off, the email channel
 * closed, or her quiet hours.
 */
export type DeliveryGateReason =
  | "type_disabled"
  | "email_channel_disabled"
  | "quiet_hours";

/** Why a letter is not going out on this pass, or null when it is. */
export type DecisionMailHold =
  | "cadence_digest"
  | "snoozed"
  | "sunday_quiet"
  | "before_local_morning"
  | "quiet_after_overdue";

export interface DecisionMailGate {
  kind: DecisionNotificationKind;
  /** Which register a decision_required letter speaks in. */
  notice: "first" | "reminder";
  /** True when this first notice announces an edition replacing an earlier one. */
  isSupersedingEdition: boolean;
  cadence: ReminderCadence;
  /** IANA zone the Sunday rule and the morning gate are read in. */
  timeZone: string;
  now: Date;
  /** decision_snoozes.snoozed_until for this reader and this approval. */
  snoozedUntil: string | null;
  /** True once a decision_overdue notice exists for this approval. */
  overdueAlreadySent: boolean;
}

/** The recipient's weekday (0 = Sunday) and hour, in her own zone. */
export function localWeekdayAndHour(
  now: Date,
  timeZone: string,
): { weekday: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const weekdayName = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const hourText = parts.find((p) => p.type === "hour")?.value ?? "0";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    .indexOf(weekdayName);
  // "24" is a legal formatted hour for midnight in some ICU builds.
  const hour = Number(hourText) % 24;
  return { weekday: weekday < 0 ? 0 : weekday, hour: Number.isNaN(hour) ? 0 : hour };
}

/**
 * R16, in one place. The order matters and each step is a separate promise:
 *
 *   • decision_resolved is the DESIGNER's letter — none of this applies.
 *   • decision_overdue ALWAYS sends. It breaks the cadence, the snooze, the
 *     Sunday rule and the morning gate, because a passed date is the one thing
 *     a homeowner asked us never to sit on.
 *   • After the overdue notice, Patina is quiet: no further automated approval
 *     mail for that approval, whatever the register. The studio takes it from
 *     there (record_decision_studio_handoff, 00572).
 *   • A snooze silences the letter until its hour — except a superseding
 *     edition, which is news about a different piece of paper.
 *   • A first notice and a superseding edition break the digest: "a new
 *     decision and a passed date are news, not summary" (ux/03 §6.2). Only the
 *     in-between reminder folds into a digest.
 *   • No automated approval mail on Sunday, and none before 8am local. The
 *     hourly cron (00572) releases the held letter at the first pass at or
 *     after 8am in her zone — which is what "send Monday 8am local" means.
 *     The 8pm side of the floor is the PUSH leg's alone (notify_client_
 *     attention / release_due_client_pushes): a letter that lands in an inbox
 *     at nine at night has not woken anybody.
 */
/**
 * Is this snooze still standing at `now`? One reading of the column for every
 * surface that must honour it — the direct letter and the summary alike.
 * 'infinity' parses as NaN through PostgREST; a snooze with no end is a
 * standing quiet, not a parse failure to shrug off.
 */
export function isSnoozeActive(
  snoozedUntil: string | null | undefined,
  now: Date,
): boolean {
  if (!snoozedUntil) return false;
  const until = new Date(snoozedUntil).getTime();
  if (Number.isNaN(until)) {
    return snoozedUntil.trim().toLowerCase().startsWith("infinity");
  }
  return until > now.getTime();
}

export function decisionMailHold(gate: DecisionMailGate): DecisionMailHold | null {
  if (gate.kind === "decision_resolved") return null;
  if (gate.kind === "decision_overdue") return null;

  if (gate.overdueAlreadySent) return "quiet_after_overdue";

  if (
    !gate.isSupersedingEdition && isSnoozeActive(gate.snoozedUntil, gate.now)
  ) {
    return "snoozed";
  }

  const breaksTheDigest = gate.notice === "first" || gate.isSupersedingEdition;
  if (!breaksTheDigest && gate.cadence !== "right_away") {
    return "cadence_digest";
  }

  const { weekday, hour } = localWeekdayAndHour(gate.now, gate.timeZone);
  if (weekday === 0) return "sunday_quiet";
  if (hour < 8) return "before_local_morning";
  return null;
}

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
  /**
   * P-13. The designer's one line about this ask, frozen into the artifact at
   * compose time (`project_approval_artifacts.why`, 00569). Absent on every
   * approval created before that migration and on every ask whose author left
   * the field empty — the letter then simply does not carry a note.
   */
  why?: string | null;
  /**
   * P-13. Who wrote that line, frozen beside it at compose time
   * (`project_approval_artifacts.why_author_name`, 00569). Any studio
   * co-member may compose an ask, so the project's designer of record is the
   * wrong signature and a later rename would rewrite a sentence she already
   * read. NULL whenever the why is.
   */
  whyAuthorName?: string | null;
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

/**
 * What the button calls the thing she is opening. A kind the map does not know
 * (ux/03 §9 ruling 5 contemplates project documents becoming approvable) is
 * still an approval — never the word "undefined".
 */
function artifactKindLabel(kind: string): string {
  return ARTIFACT_KIND_LABEL[kind as ApprovalArtifactCitation["kind"]] ??
    "approval";
}

/**
 * The promise the letter makes about the attached edition. An unmapped kind
 * gets the neutral clause rather than a predicate nobody wrote for it.
 */
function artifactReadyClause(artifact: ApprovalArtifactCitation): string {
  const predicate =
    ARTIFACT_KIND_PREDICATE[artifact.kind as ApprovalArtifactCitation["kind"]];
  return predicate ? `is ready, ${predicate}.` : "is ready for your answer.";
}

/**
 * Titles are stored as the studio typed them — "approve the issued set" is a
 * real one — so every letter quotes the title instead of letting it open a
 * sentence. One rule, subject and body alike (F5).
 */
function quoted(text: string): string {
  return `"${text}"`;
}

/**
 * True when the edition attached to this ask is the one that was sent: the
 * artifact was issued no later than the day the studio asked. A legacy option
 * choice carries no edition and so claims nothing — which is exactly the row
 * `extend_and_reopen_client_decision` moves the date on and wipes the answer
 * from (00399:3595), where "nothing has changed" would be false (F8).
 */
function editionUnchangedSinceSent(decision: DecisionContext): boolean {
  const issued = decision.artifact?.issuedAt;
  if (!issued || !decision.sentAt) return false;
  const issuedAt = new Date(issued).getTime();
  const sentAt = new Date(decision.sentAt).getTime();
  if (Number.isNaN(issuedAt) || Number.isNaN(sentAt)) return false;
  return issuedAt <= sentAt;
}

export interface DecisionContext {
  id: string;
  title: string | null;
  dueDate: string | null;
  artifact?: ApprovalArtifactCitation | null;
  /** client_decisions.sent_at — the day the studio asked. */
  sentAt?: string | null;
  /**
   * Which register a decision_required letter speaks in. The producer declares
   * it, because no state on the row can be read backwards into it. The
   * publish-time producer (decision-first-notice, fired by the trigger in
   * 00568 as the decision enters the client's court) says "first";
   * decision-reminders, whose notice arrives 48 hours before the due date and
   * therefore long after the studio pressed send, says "reminder" — and so
   * does the default, because a letter claiming the studio just sent something
   * is a lie unless its producer runs at the moment of sending.
   */
  notice?: "first" | "reminder";
  /**
   * P-27. Present only when this ask replaces an earlier edition she has
   * already seen — `client_decisions.predecessor_decision_id` (00463) resolved
   * by the producer. A successor is a NEW decision, never a reopen, and the
   * letter says so: the edition she answered stays in the record.
   */
  supersedes?: SupersededEdition | null;
}

/**
 * P-27. What the successor letter may truthfully say about the edition it
 * replaces. Every field is optional because every field is evidence: an
 * unanswered predecessor names no answer, and a predecessor with no artifact
 * yields no delta. Nothing here is computed from the successor alone.
 */
export interface SupersededEdition {
  /** The predecessor's edition number. */
  version: number;
  /** Its artifact title, when it carried one. */
  title?: string | null;
  /** The day she answered it (client_decisions.responded_at). */
  answeredOn?: string | null;
  /** What she answered, in the stamp's own word. */
  answeredOutcome?: DecisionReceiptOutcome | null;
  /**
   * Differences between the successor's frozen artifact and the predecessor's
   * (project_approval_artifacts, joined by predecessor_decision_id). Absent
   * when either side carries no artifact — a delta with nothing to subtract
   * from is not a fact.
   */
  costCentsDelta?: number | null;
  scheduleDaysDelta?: number | null;
  leadTimeDaysDelta?: number | null;
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
 * The metadata a prior email for this letter would carry. decision_required is
 * TWO letters — the first notice and the reminder — so its key carries the
 * register; one may not deduplicate the other. The other kinds are one letter
 * each and key on the decision alone, exactly as before.
 */
export function decisionLogKey(
  kind: DecisionNotificationKind,
  decision: DecisionContext,
): Record<string, unknown> {
  if (kind !== "decision_required") return { decisionId: decision.id };
  return { decisionId: decision.id, notice: decisionNotice(decision) };
}

/** The declared register, defaulted. */
function decisionNotice(decision: DecisionContext): "first" | "reminder" {
  return decision.notice === "first" ? "first" : "reminder";
}

/**
 * Return the prior non-retryable email state for this (decision, kind). This
 * keeps delivery idempotent without collapsing in-flight and terminal states.
 */
async function existingEmailLogStatus(
  supabase: SupabaseClient,
  userId: string | null,
  decision: DecisionContext,
  kind: DecisionNotificationKind,
): Promise<DecisionEmailLogStatus | null> {
  const query = supabase
    .from("notification_log")
    .select("status")
    .eq("type", KIND_TO_LOG_TYPE[kind])
    .eq("channel", "email")
    .neq("status", "failed")
    .contains("metadata", decisionLogKey(kind, decision));
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
function weekday(
  iso: string | null | undefined,
  timeZone: string,
): string | null {
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
 * P-13. The designer's own line, under the ask, in her voice and signed with
 * her given name — not a second paragraph of Patina's prose. Rendered as a
 * quotation because that is what it is: a sentence one person wrote to
 * another.
 *
 * The attribution is dropped rather than invented when no name resolved. "—
 * Your designer" under a first-person sentence reads as a system speaking in
 * someone's place, which is the one thing this line exists to avoid.
 *
 * The frozen author wins over the cobrand signature. `cobrand.designerGivenName`
 * is the project's designer of record resolved live at send time; a studio
 * co-member may compose the ask, and a designer may be renamed between the
 * first notice and the overdue letter. Either way the letter would sign a
 * first-person sentence with someone who did not write it, and disagree with
 * the projection, which renders the frozen name.
 */
function renderDesignerNote(
  artifact: ApprovalArtifactCitation | null | undefined,
  cobrand: DecisionCobrand,
): string {
  const note = (artifact?.why ?? "").trim();
  if (!note) return "";
  const named = (artifact?.whyAuthorName ?? "").trim() ||
    (cobrand.designerGivenName ?? "").trim() ||
    (cobrand.studioName ?? "").trim();
  return [
    paragraph(`&ldquo;${escapeHtml(note)}&rdquo;`),
    named ? muted(`&mdash; ${escapeHtml(named)}`) : "",
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

/**
 * P-27. Money as she reads it: whole dollars unless the cents are real. A
 * delta is signed, because "$1,240" and "−$1,240" are different news.
 */
export function formatCostDelta(cents: number): string {
  const abs = Math.abs(cents);
  const amount = (abs / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: abs % 100 === 0 ? 0 : 2,
    maximumFractionDigits: abs % 100 === 0 ? 0 : 2,
  });
  if (cents === 0) return amount;
  return `${cents > 0 ? "+" : "\u2212"}${amount}`;
}

/** "4 days" / "1 day", for a schedule or a lead time. */
function dayCount(days: number): string {
  const abs = Math.abs(days);
  return `${abs} ${abs === 1 ? "day" : "days"}`;
}

/**
 * P-27 / R11. The three deltas stated INDEPENDENTLY, side by side — never
 * summed, and never dressed in a colour. Each line is omitted when its number
 * is not computable; a delta of zero is stated as "unchanged", because "holds"
 * is a fact she asked for.
 *
 * No baseline is rendered: `project_approval_artifacts` carries the deltas and
 * no baseline column (W2-n3), and R11 asks for a baseline only "where one
 * exists". A delta alone is a fragment; a delta named as a delta is not.
 */
export function supersededDeltaLines(
  edition: SupersededEdition,
): string[] {
  const lines: string[] = [];
  const previous = `edition ${edition.version}`;
  if (typeof edition.costCentsDelta === "number") {
    lines.push(
      edition.costCentsDelta === 0
        ? `Cost: unchanged from ${previous}.`
        : `Cost: ${formatCostDelta(edition.costCentsDelta)} against ${previous}.`,
    );
  }
  if (typeof edition.scheduleDaysDelta === "number") {
    lines.push(
      edition.scheduleDaysDelta === 0
        ? `Schedule: unchanged from ${previous}.`
        : `Schedule: ${dayCount(edition.scheduleDaysDelta)} ${
          edition.scheduleDaysDelta > 0 ? "later" : "earlier"
        } than ${previous}.`,
    );
  }
  if (typeof edition.leadTimeDaysDelta === "number") {
    lines.push(
      edition.leadTimeDaysDelta === 0
        ? `Lead time: unchanged from ${previous}.`
        : `Lead time: ${dayCount(edition.leadTimeDaysDelta)} ${
          edition.leadTimeDaysDelta > 0 ? "longer" : "shorter"
        } than ${previous}.`,
    );
  }
  return lines;
}

/**
 * P-27. The continuation sentence. It names her own answer where the record
 * carries one, and the edition number where it does not — and it never says
 * the earlier answer was undone, because it was not: a successor is a new
 * decision and the edition she answered stays in the record.
 */
export function supersededOpeningLine(
  newVersion: number,
  edition: SupersededEdition,
  timeZone: string,
): string {
  const answeredOn = calendarDay(edition.answeredOn, timeZone);
  const verb = edition.answeredOutcome === "approved"
    ? "approved"
    : edition.answeredOutcome === "returned"
    ? "returned"
    : edition.answeredOutcome === "held"
    ? "held"
    : null;
  if (answeredOn && verb) {
    return `Edition ${newVersion} replaces the edition you ${verb} on ${answeredOn}.`;
  }
  return `Edition ${newVersion} replaces edition ${edition.version}.`;
}

export function decisionNotificationMetadata(
  kind: DecisionNotificationKind,
  decision: DecisionContext,
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    decisionId: decision.id,
    kind,
  };
  if (kind === "decision_required") metadata.notice = decisionNotice(decision);
  // P-27: which edition this one replaces, for the record and for support.
  // NOT part of decisionLogKey — the dedupe key stays {decisionId, notice}.
  if (decision.supersedes) {
    metadata.supersedesVersion = decision.supersedes.version;
  }
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

/**
 * Subject rule, one across all three letters (F11): no trailing period, and the
 * stored title in quotation marks.
 *   first     Leah sent "Kitchen plan set" for your approval
 *   reminder  Thursday: "Kitchen plan set"
 *   overdue   Still open: "Kitchen plan set"
 */
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
  // A Stage-2 row carries a frozen edition and is an APPROVAL; a legacy row is
  // a choice between named alternatives, which the vocabulary ruling calls a
  // DECISION. Only the artifact tells them apart here — the Stage-2 producers
  // resolve one or refuse to send (F7).
  const isApproval = Boolean(decision.artifact);
  const askWord = isApproval ? "approval" : "decision";
  const kindLabel = decision.artifact
    ? artifactKindLabel(decision.artifact.kind)
    : "decision";
  const eyebrow = isApproval ? "Approval" : "Decision";
  const titleHtml = quoted(
    `<strong style="color:#1F1B16; font-weight:600;">${
      escapeHtml(title)
    }</strong>`,
  );
  const studioSignature = signOff(cobrand);
  const named = (cobrand.designerGivenName ?? "").trim() ||
    (cobrand.studioName ?? "").trim();
  // Sentence-initial and mid-sentence forms of the same person. The fallback
  // is the only one that changes case; a real name keeps its capitals (F6).
  const asker = named || "Your designer";
  const askerMidSentence = named || "your designer";

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
  const designerNote = renderDesignerNote(decision.artifact, cobrand);
  const door = renderDoor(decision.id, `Review the ${kindLabel}`);
  const dueWeekday = weekday(decision.dueDate, timeZone);
  const dueDay = calendarDay(decision.dueDate, timeZone);

  if (kind === "decision_overdue") {
    // P-04. No "overdue", no passed-its-date, no gentle nudge: the word she
    // reads is the state she is in, and the studio carries the rest.
    const subject = `Still open: ${quoted(title)}`;
    const askedOn = calendarDay(decision.sentAt, timeZone);
    const opening = askedOn
      ? `Still open, ${escapeHtml(askerMidSentence)} asked on ${
        escapeHtml(askedOn)
      }.`
      : "Still open.";
    return {
      subject,
      html: renderBrandedShell({
        title: subject,
        preview: "Still open.",
        eyebrow,
        audience: "client",
        studioName: cobrand.studioName,
        studioLogoUrl: cobrand.studioLogoUrl,
        body: [
          paragraph(`Hi ${escapeHtml(name)},`),
          paragraph(opening),
          paragraph(
            `${titleHtml} is waiting for your answer, exactly as it was sent.`,
          ),
          designerNote,
          editionLine,
          door,
          studioSignature,
        ].join(""),
      }),
    };
  }

  // P-27. The successor read as one thread. A superseding edition is still a
  // first notice — it announces — but it opens on what she already answered
  // and names what moved since, instead of arriving as an unrelated second
  // letter with two bare links.
  if (decision.notice === "first" && decision.supersedes) {
    const previous = decision.supersedes;
    const thisVersion = decision.artifact?.version ?? previous.version + 1;
    const subject = `Edition ${thisVersion} of ${quoted(title)}`;
    const deltas = supersededDeltaLines(previous);
    return {
      subject,
      html: renderBrandedShell({
        title: subject,
        preview: `Edition ${thisVersion} replaces edition ${previous.version}.`,
        eyebrow,
        audience: "client",
        studioName: cobrand.studioName,
        studioLogoUrl: cobrand.studioLogoUrl,
        body: [
          paragraph(`Hi ${escapeHtml(name)},`),
          paragraph(
            escapeHtml(
              supersededOpeningLine(thisVersion, previous, timeZone),
            ),
          ),
          deltas.length
            ? paragraph(
              `What changed: ${
                deltas.map((line) => escapeHtml(line)).join(" ")
              }`,
            )
            : "",
          designerNote,
          editionLine,
          dueWeekday && dueDay
            ? paragraph(`Due ${escapeHtml(dueWeekday)}, ${escapeHtml(dueDay)}.`)
            : "",
          // Nothing she did is undone. The earlier edition and the answer she
          // gave it are both still in the record — this letter says so out
          // loud rather than leaving her to wonder.
          paragraph(
            `Edition ${previous.version} stays in the record.`,
          ),
          door,
          studioSignature,
        ].join(""),
      }),
    };
  }

  // decision_required. Two letters, one kind: a first notice announces, a
  // reminder returns. The producer says which; absent that, the letter returns.
  if (decision.notice === "first") {
    const subject = `${asker} sent ${quoted(title)} for your ${askWord}`;
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
        eyebrow,
        audience: "client",
        studioName: cobrand.studioName,
        studioLogoUrl: cobrand.studioLogoUrl,
        body: [
          paragraph(`Hi ${escapeHtml(name)},`),
          paragraph(
            `${titleHtml} ${
              decision.artifact
                ? artifactReadyClause(decision.artifact)
                : "is ready for your answer."
            }`,
          ),
          designerNote,
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

  const subject = dueWeekday
    ? `${dueWeekday}: ${quoted(title)}`
    : `Still waiting: ${quoted(title)}`;
  return {
    subject,
    html: renderBrandedShell({
      title: subject,
      preview: dueWeekday ? `Still open. Due ${dueWeekday}.` : "Still open.",
      eyebrow,
      audience: "client",
      studioName: cobrand.studioName,
      studioLogoUrl: cobrand.studioLogoUrl,
      body: [
        paragraph(`Hi ${escapeHtml(name)},`),
        paragraph(
          `${titleHtml} is still open${
            dueWeekday ? ` and due ${escapeHtml(dueWeekday)}` : ""
          }.${
            editionUnchangedSinceSent(decision)
              ? " Nothing has changed since it was sent."
              : ""
          }`,
        ),
        designerNote,
        editionLine,
        door,
        studioSignature,
      ].join(""),
    }),
  };
}

// ── P-20. The approval receipt ─────────────────────────────────────────────
//
// The one letter addressed to the homeowner AFTER she answers. It never
// re-offers the act, carries no call to action beyond a plain link to the
// record, and names a consequence only where the data carries one (R9).
//
// It is not a DecisionNotificationKind: those three each own a spine RPC
// (00173) and this one has none — the client's in-app row and push envelope
// are written by notify_client_attention from inside the response itself
// (00569). This is the email leg alone.

/** What she did, in the word the stamp uses. */
export type DecisionReceiptOutcome = "approved" | "returned" | "held";

/**
 * The database's three outcomes, in the vocabulary the homeowner reads.
 * `changes_requested` is RETURNED everywhere — never "Declined".
 */
export function receiptOutcomeWord(
  outcome: string | null | undefined,
): DecisionReceiptOutcome | null {
  switch (outcome) {
    case "approved":
      return "approved";
    case "changes_requested":
      return "returned";
    case "needs_discussion":
      return "held";
    default:
      return null;
  }
}

const RELEASED_COUNT_WORD: readonly string[] = [
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
  "twenty",
];

/**
 * The consequence clause, or silence dressed as one honest sentence.
 *
 * Mirrors `public._project_approval_release_sentence` (00569), which writes the
 * identical line into the bell and the push, so the three surfaces say the same
 * thing about the same answer. Nothing released ⇒ nothing claimed.
 *
 * A piece is NAMED only when it is the only one and its name carries no comma.
 * `project_ffe_items.name` is catalogue text the studio typed — "Built-in
 * shelving, north wall" is an ordinary one — so joining two of them with "and"
 * produced "It releases Built-in shelving, north wall and Built-in Window
 * Banquette", which reads as a list of three things. Everything else is counted
 * in words, up to twenty; past that the count stops being worth reading and the
 * sentence states the fact without it.
 */
export function decisionReleaseSentence(
  releasedItems: readonly string[] = [],
): string {
  const names = releasedItems
    .map((name) => (name ?? "").trim())
    .filter((name) => name.length > 0);
  if (names.length === 0) return "Your answer is on the record.";
  if (names.length === 1 && !names[0].includes(",")) {
    return `It releases ${names[0]}.`;
  }
  const word = RELEASED_COUNT_WORD[names.length - 1] ?? "the";
  const piece = names.length === 1
    ? "piece that was waiting on it"
    : "pieces that were waiting on it";
  return `It releases ${word} ${piece}.`;
}

export interface DecisionReceiptContext extends DecisionContext {
  /** What she answered, as `client_decisions.answer` spells it. */
  outcome: string | null;
  /**
   * `project_ffe_items.name` for every piece this answer unblocked, frozen
   * into the immutable `responded` receipt by 00569 because the response
   * clears the link it would otherwise be read back through. Empty for a
   * return, a hold, and an approval that released nothing.
   */
  releasedItems?: readonly string[];
}

/**
 * The receipt, rendered.
 *
 * Subject: "You approved "Kitchen plan set"." — second person, past tense, the
 * act already done. Body: what it released, or the one sentence that claims
 * nothing. Then the record's address as a plain link. No button: a button is an
 * invitation to act, and there is nothing left to do.
 */
export function renderDecisionReceiptEmail(
  recipientName: string,
  decision: DecisionReceiptContext,
  cobrand: DecisionCobrand = {},
): RenderedEmail {
  const name = recipientName || "there";
  const word = receiptOutcomeWord(decision.outcome) ?? "answered";
  const title = decision.artifact?.title || decision.title || "the approval";
  const subject = `You ${word} "${title}".`;
  const url = clientDecisionLink(portalBaseFor("client"), decision.id);
  const consequence = decisionReleaseSentence(decision.releasedItems ?? []);
  return {
    subject,
    html: renderBrandedShell({
      title: subject,
      preview: consequence,
      eyebrow: "Answered",
      audience: "client",
      studioName: cobrand.studioName,
      studioLogoUrl: cobrand.studioLogoUrl,
      body: [
        paragraph(`Hi ${escapeHtml(name)},`),
        paragraph(
          `You ${word} <strong style="color:#1F1B16; font-weight:600;">${
            escapeHtml(title)
          }</strong>.`,
        ),
        paragraph(escapeHtml(consequence)),
        muted(
          `The record: <a href="${url}" style="color:#4E7A66; text-decoration:none;">${
            escapeHtml(url)
          }</a>`,
        ),
        signOff(cobrand),
      ].join(""),
    }),
  };
}

/** notification_log.type for the receipt. One letter per decision, ever. */
const RECEIPT_LOG_TYPE = "decision_receipt";

/**
 * Send the receipt through the same compliance chokepoint as every other
 * client letter: preference + channel gate, quiet hours, suppression, rate
 * cap, notification_log dedupe on (decision, type).
 *
 * Quiet hours DEFER rather than drop — the receipt is not urgent and the
 * caller's trigger is one-shot, so a deferred receipt is a receipt not sent.
 * It is therefore treated like the resolved notice: sent whenever the response
 * lands, because the act it acknowledges just happened and a letter about it
 * arriving eight hours later is a stranger.
 */
export async function deliverDecisionReceipt(
  supabase: SupabaseClient,
  decision: DecisionReceiptContext,
  recipient: DecisionRecipient,
  cobrand: DecisionCobrand = {},
): Promise<DeliverDecisionNotificationResult> {
  if (!recipient.email) {
    return {
      inAppOk: true,
      emailSent: false,
      emailSkipped: true,
      reason: "no_recipient_email",
    };
  }

  if (recipient.userId) {
    const pref = await loadPreferences(supabase, recipient.userId);
    if (pref.type_project_milestone === false) {
      return {
        inAppOk: true,
        emailSent: false,
        emailSkipped: true,
        reason: "type_disabled",
      };
    }
    if (pref.channels_email === false) {
      return {
        inAppOk: true,
        emailSent: false,
        emailSkipped: true,
        reason: "email_channel_disabled",
      };
    }
  }

  const query = supabase
    .from("notification_log")
    .select("status")
    .eq("type", RECEIPT_LOG_TYPE)
    .eq("channel", "email")
    .neq("status", "failed")
    .contains("metadata", { decisionId: decision.id });
  if (recipient.userId) query.eq("user_id", recipient.userId);
  const { data: priorRows, error: priorError } = await query;
  if (priorError) {
    console.error("decision receipt log lookup failed", priorError);
  }
  const existingLogStatus = classifyExistingDecisionEmailLogStatuses(
    ((priorRows ?? []) as Array<{ status: string }>).map((row) => row.status),
  );
  if (existingLogStatus) {
    return {
      inAppOk: true,
      emailSent: false,
      emailSkipped: true,
      reason: "already_sent",
      existingLogStatus,
    };
  }

  const rendered = renderDecisionReceiptEmail(
    recipient.name ?? "",
    decision,
    cobrand,
  );
  const result = await sendCompliantEmail(supabase, {
    to: recipient.email,
    subject: rendered.subject,
    html: rendered.html,
    userId: recipient.userId ?? undefined,
    notificationType: RECEIPT_LOG_TYPE,
    category: "operational",
    templateId: "decision-receipt",
    metadata: {
      decisionId: decision.id,
      kind: RECEIPT_LOG_TYPE,
      outcome: decision.outcome,
      releasedItemCount: (decision.releasedItems ?? []).length,
    },
  });

  return {
    inAppOk: true,
    emailSent: result.success === true,
    emailSkipped: result.success !== true,
    reason: result.success ? undefined : result.error ?? "send_failed",
  };
}

/**
 * P-28. The standing snooze this reader set on this approval, or null. Read
 * rather than passed in, so every producer honours it without having to know
 * it exists. A lookup failure returns null: a snooze that cannot be read must
 * not become a silence nobody asked for.
 */
async function decisionSnoozedUntil(
  supabase: SupabaseClient,
  userId: string | null,
  decisionId: string,
): Promise<string | null> {
  if (!userId) return null;
  const { data, error } = await supabase
    .from("decision_snoozes")
    .select("snoozed_until")
    .eq("user_id", userId)
    .eq("decision_id", decisionId)
    .maybeSingle();
  if (error) {
    console.warn("decision-notify: snooze lookup failed", error);
    return null;
  }
  return (data as { snoozed_until?: string } | null)?.snoozed_until ?? null;
}

/**
 * R16. True once the overdue notice exists for this approval. After it, Patina
 * is quiet and the studio chases by hand — so no further automated approval
 * mail goes out, whatever produced it. Read from the spine table
 * (decision_notifications, 00173), which the overdue RPC writes idempotently,
 * rather than from the mail log: the promise is about the notice, not about
 * whether one particular letter happened to send.
 */
/**
 * Does the bell row for this (decision, kind) already exist?
 *
 * A failure to read answers false, so the row is written: the in-app line is
 * the one thing R16 never defers, and an unwritten one is worse than a
 * refreshed one.
 */
async function decisionInAppRowExists(
  supabase: SupabaseClient,
  decisionId: string,
  kind: DecisionNotificationKind,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("decision_notifications")
    .select("id")
    .eq("decision_id", decisionId)
    .eq("kind", kind)
    .limit(1);
  if (error) {
    console.warn("decision-notify: in-app row lookup failed", error);
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

/**
 * A hold that will not lift by itself: she has said no, or the conversation is
 * over. The cadence hold is NOT one of these — it is a hand-off to the digest,
 * which is built from the freshness of the very row the RPC re-arms — and
 * neither are the hours-long ones (Sunday, before her morning, her own quiet
 * hours), which lift on their own and whose letter then stamps the approval
 * out of the cron's window.
 */
const STANDING_QUIET: ReadonlySet<string> = new Set<string>([
  "snoozed",
  "quiet_after_overdue",
  "type_disabled",
  "email_channel_disabled",
]);

/**
 * Whether this pass may call the spine RPC.
 *
 * `_enqueue_decision_notification` (00466) is idempotent about the ROW but not
 * about its state: a service-role re-call sets `read_at = NULL` and moves
 * `created_at` forward, which is right when a letter is going out or being
 * handed to the digest, and wrong when Patina has been asked to be quiet.
 * Since 00572 the reminder cron runs hourly, so a snoozed approval would
 * otherwise be re-armed twenty-four times a day — her line popping back to
 * unread every hour, and its refreshed timestamp keeping it inside the digest
 * window forever (r1 M5).
 *
 * So: write the row when there is none, when the letter is going out, or when
 * the hold will lift on its own. Never re-arm a line that is already standing
 * into a silence she asked for.
 */
export function shouldFireDecisionInApp(args: {
  hold: DecisionMailHold | DeliveryGateReason | null;
  rowExists: boolean;
}): boolean {
  if (!args.hold) return true;
  if (!args.rowExists) return true;
  return !STANDING_QUIET.has(args.hold);
}

async function decisionOverdueAlreadySent(
  supabase: SupabaseClient,
  decisionId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("decision_notifications")
    .select("id")
    .eq("decision_id", decisionId)
    .eq("kind", "decision_overdue")
    .limit(1);
  if (error) {
    console.warn("decision-notify: overdue lookup failed", error);
    return false;
  }
  return Array.isArray(data) && data.length > 0;
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
  // 1. The gate comes FIRST (r1 M5). Every reason a letter might not go out on
  // this pass is decided before the spine RPC is called, because the RPC
  // re-arms an existing bell row — unread again, created_at moved forward —
  // and on an hourly cron that would keep a deliberately quiet approval
  // permanently fresh. The row is still written whenever there is none: the
  // in-app line is never deferred, only never re-armed for nothing.
  //
  // The recipient's zone also decides which weekday her due date is, so it is
  // hoisted out of the gate and handed to the renderer.
  let timeZone = DEFAULT_TIME_ZONE;
  let held: DecisionMailHold | DeliveryGateReason | null = null;
  if (recipient.userId) {
    const pref = await loadPreferences(supabase, recipient.userId);
    timeZone = pref.timezone?.trim() || DEFAULT_TIME_ZONE;

    const typeCol = KIND_TO_PREF_COLUMN[kind];
    const typeEnabled = pref[typeCol] !== false; // null/undefined ⇒ default on
    if (!typeEnabled) {
      held = "type_disabled";
    } else if (pref.channels_email === false) {
      held = "email_channel_disabled";
    } else {
      // R16's one gate (00572): the cadence, the snooze she set, the Sunday
      // rule, the morning floor, and the quiet after the overdue notice — all
      // decided by decisionMailHold, which is a pure function and is tested as
      // one. A hold loses nothing: the digest batches it, or the hourly cron
      // returns for it.
      held = decisionMailHold({
        kind,
        notice: decisionNotice(decision),
        isSupersedingEdition: Boolean(decision.supersedes),
        cadence: normalizeReminderCadence(pref.reminder_cadence),
        timeZone,
        now: new Date(),
        snoozedUntil: await decisionSnoozedUntil(
          supabase,
          recipient.userId,
          decision.id,
        ),
        overdueAlreadySent: kind === "decision_required"
          ? await decisionOverdueAlreadySent(supabase, decision.id)
          : false,
      });

      // Her own quiet hours, unchanged from Wave 1: overdue is time-critical
      // and bypasses them; required/resolved defer and the cron re-attempts.
      if (!held && kind !== "decision_overdue" && isQuietHours(pref)) {
        held = "quiet_hours";
      }
    }
  }

  // 2. The bell row, written unless it is already standing and quiet is what
  // this pass owes her.
  const mayFire = shouldFireDecisionInApp({
    hold: held,
    rowExists: held
      ? await decisionInAppRowExists(supabase, decision.id, kind)
      : false,
  });
  const inApp = mayFire
    ? await fireDecisionInApp(supabase, decision.id, kind)
    : { ok: true, id: null };

  // 3. No email target → in-app only (not-yet-signed-up client, etc.).
  if (!recipient.email) {
    return {
      inAppOk: inApp.ok,
      emailSent: false,
      emailSkipped: true,
      reason: "no_recipient_email",
    };
  }

  if (held) {
    return {
      inAppOk: inApp.ok,
      emailSent: false,
      emailSkipped: true,
      reason: held,
    };
  }

  // 4. Email idempotency: already logged for this (decision, kind)?
  const existingLogStatus = await existingEmailLogStatus(
    supabase,
    recipient.userId,
    decision,
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
