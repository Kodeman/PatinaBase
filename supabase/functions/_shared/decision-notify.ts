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
  /**
   * P-13. The designer's one line about this ask, frozen into the artifact at
   * compose time (`project_approval_artifacts.why`, 00569). Absent on every
   * approval created before that migration and on every ask whose author left
   * the field empty — the letter then simply does not carry a note.
   */
  why?: string | null;
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
 * P-13. The designer's own line, under the ask, in her voice and signed with
 * her given name — not a second paragraph of Patina's prose. Rendered as a
 * quotation because that is what it is: a sentence one person wrote to
 * another.
 *
 * The attribution is dropped rather than invented when no name resolved. "—
 * Your designer" under a first-person sentence reads as a system speaking in
 * someone's place, which is the one thing this line exists to avoid.
 */
function renderDesignerNote(
  why: string | null | undefined,
  cobrand: DecisionCobrand,
): string {
  const note = (why ?? "").trim();
  if (!note) return "";
  const named = (cobrand.designerGivenName ?? "").trim() ||
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

export function decisionNotificationMetadata(
  kind: DecisionNotificationKind,
  decision: DecisionContext,
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    decisionId: decision.id,
    kind,
  };
  if (kind === "decision_required") metadata.notice = decisionNotice(decision);
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
  const designerNote = renderDesignerNote(decision.artifact?.why, cobrand);
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
 * thing about the same answer. One or two pieces are named; up to twenty are
 * counted in words; past that the count stops being worth reading and the
 * sentence states the fact without it. Nothing released ⇒ nothing claimed.
 */
export function decisionReleaseSentence(
  releasedItems: readonly string[] = [],
): string {
  const names = releasedItems
    .map((name) => (name ?? "").trim())
    .filter((name) => name.length > 0);
  if (names.length === 0) return "Your answer is on the record.";
  if (names.length === 1) return `It releases ${names[0]}.`;
  if (names.length === 2) return `It releases ${names[0]} and ${names[1]}.`;
  const word = RELEASED_COUNT_WORD[names.length - 3] ?? "the";
  return `It releases ${word} pieces that were waiting on it.`;
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
