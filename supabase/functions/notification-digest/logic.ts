// Pure, side-effect-free helpers for the notification-digest edge function.
// Extracted so they can be unit-tested with `deno test` without a live DB.

import {
  ctaButton,
  heading,
  muted,
  paragraph,
  renderBrandedShell,
  spacer,
} from "../_shared/branded-email.ts";
import type { ApprovalArtifactCitation } from "../_shared/decision-notify.ts";
import { clientDecisionLink } from "../_shared/client-portal-links.ts";

const SERIF = "'Fraunces', Georgia, 'Times New Roman', serif";
const SANS =
  "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

export type ReminderDigestCategory = "proposal" | "approval" | "choice";

/** Which cadence this digest is being built for (00572). */
export type DigestPeriod = "daily" | "weekly_sunday";

export interface ReminderDigestItem {
  category: ReminderDigestCategory;
  title: string;
  link: string | null;
  decisionId?: string;
  artifact?: ApprovalArtifactCitation | null;
}

/**
 * The vocabulary ruling, in the digest's own headings (Wave-1 carry, backend
 * r3-M1). "Approval" is the only name for the ask; "decision" is allowed only
 * for a choice between named alternatives. One heading could not be both, so
 * the digest splits on `approval_contract` — a Stage-2 artifact-bound ask is an
 * approval, a legacy option row is a choice.
 */
export function digestCategoryForDecision(
  approvalContract: string | null | undefined,
): ReminderDigestCategory {
  return approvalContract === "project_artifact_v1" ? "approval" : "choice";
}

/**
 * R16's quiet, on the digest side. After the overdue notice Patina says nothing
 * further about that approval — including inside a summary, which is still an
 * automated letter about it. The weekly digest makes this load-bearing: its
 * seven-day window can reach back past a notice that already went out.
 */
export function dropDecisionsPastOverdue(
  items: ReminderDigestItem[],
  overdueDecisionIds: readonly string[],
): ReminderDigestItem[] {
  if (overdueDecisionIds.length === 0) return items;
  const quiet = new Set(overdueDecisionIds);
  return items.filter((item) =>
    !(item.decisionId && quiet.has(item.decisionId))
  );
}

export interface RenderedDigest {
  subject: string;
  html: string;
}

// A same-day cron retry must not re-send. We treat a user as due only when no
// digest has gone out inside the last 20h — long enough to cover the daily run
// with jitter, short enough to fire once per day.
const DIGEST_MIN_INTERVAL_MS = 20 * 60 * 60 * 1000;

/**
 * True when the user should receive a reminder digest now: never sent, or the
 * last one is older than the 20h min-interval (idempotency guard). An
 * unparseable watermark fails open (treated as never sent).
 */
export function isReminderDigestDue(
  lastSentAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!lastSentAt) return true;
  const last = new Date(lastSentAt).getTime();
  if (Number.isNaN(last)) return true;
  return now.getTime() - last >= DIGEST_MIN_INTERVAL_MS;
}

// Six days, not seven: the weekly run has to be able to fire on the same
// weekday it fired last week without the guard rounding it out.
const WEEKLY_MIN_INTERVAL_MS = 6 * 24 * 60 * 60 * 1000;

/** How far back each cadence looks. The weekly window is its own week. */
export const DIGEST_WINDOW_MS: Record<DigestPeriod, number> = {
  daily: 24 * 60 * 60 * 1000,
  weekly_sunday: 7 * 24 * 60 * 60 * 1000,
};

/**
 * "Once a week, on Sunday" means Sunday in HER zone, not in the cron's. The
 * digest cron runs daily; this is the gate that makes six of those runs a
 * no-op for a weekly reader.
 */
export function isSundayLocal(now: Date, timeZone: string): boolean {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(now);
  return weekday === "Sun";
}

/** Whether this reader's digest is due now, for the cadence she chose. */
export function isDigestDue(
  period: DigestPeriod,
  lastSentAt: string | null | undefined,
  now: Date,
  timeZone: string,
): boolean {
  if (period === "daily") return isReminderDigestDue(lastSentAt, now);
  if (!isSundayLocal(now, timeZone)) return false;
  if (!lastSentAt) return true;
  const last = new Date(lastSentAt).getTime();
  if (Number.isNaN(last)) return true;
  return now.getTime() - last >= WEEKLY_MIN_INTERVAL_MS;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const CATEGORY_LABELS: Record<ReminderDigestCategory, string> = {
  proposal: "Proposals awaiting your review",
  approval: "Approvals that need you",
  choice: "Choices that need you",
};

// Stable render order.
const CATEGORY_ORDER: ReminderDigestCategory[] = [
  "proposal",
  "approval",
  "choice",
];

// The zone the rest of the notification rail falls back to when a recipient
// stored none (decision-notify's DEFAULT_TIME_ZONE).
const DEFAULT_TIME_ZONE = "America/New_York";

export function artifactCitationsForDigest(
  items: ReminderDigestItem[],
): Array<Record<string, unknown>> {
  return items.flatMap((item) => {
    if (!item.decisionId || !item.artifact) return [];
    return [{
      decisionId: item.decisionId,
      artifactKind: item.artifact.kind,
      artifactVersion: item.artifact.version,
      artifactChecksum: item.artifact.checksum,
      artifactTitle: item.artifact.title,
    }];
  });
}

/**
 * How a decision line is titled in the digest. An approval past its date is
 * still open, never "overdue": that word does not reach a homeowner (P-04).
 */
export function decisionDigestTitle(kind: string, title: string): string {
  return kind === "decision_overdue" ? `Still open: ${title}` : title;
}

/**
 * Where a digest line sends her: the same address the decision letter's own
 * door carries (F12). Mail wrote the Universal Link `/decisions/<id>` while the
 * digest hand-wrote a Threshold anchor, so one approval had two addresses in
 * the same inbox — and only one of them opens the iOS app. One builder now.
 *
 * The anchor the digest gave up also named the project; the fold recovers that,
 * carrying `?decision=` so the front door resolves the approval's own house
 * (`retired-routes.ts`, `lib/data/active-project.ts`) rather than opening the
 * house that merely moved last.
 */
export function decisionDigestLink(
  baseUrl: string,
  decisionId: string | null | undefined,
): string {
  return clientDecisionLink(baseUrl, decisionId);
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
 * The homeowner's copy of the citation (R6): which edition, issued when. The
 * checksum and the enum spelling stay in the record — she was never able to act
 * on either, and 64 hex characters in a letter read as an error message.
 */
function renderArtifactCitation(
  artifact: ApprovalArtifactCitation | null | undefined,
  timeZone: string,
): string {
  if (!artifact) return "";
  const issued = calendarDay(artifact.issuedAt, timeZone);
  const line = issued
    ? `Edition ${artifact.version} · issued ${escapeHtml(issued)}`
    : `Edition ${artifact.version}`;
  return `<div style="margin:4px 0 0;color:#6D675E;font-family:${SANS};font-size:12px;line-height:1.45;">` +
    `${escapeHtml(artifact.title)}<br>${line}` +
    `</div>`;
}

/**
 * Build the single daily reminder digest email from a user's accumulated
 * unread reminder items. Groups by category with a simple bulleted list — no
 * per-item styling flourishes, just a clear "here's what's waiting" summary.
 */
export function buildReminderDigestEmail(
  items: ReminderDigestItem[],
  baseUrl: string,
  /** The recipient's notification_preferences.timezone; the issue dates are
   * printed in it, and the rail's own fallback stands in when it is unset. */
  timeZone?: string | null,
  /** Which cadence this summary is for; daily unless she asked for Sunday. */
  period: DigestPeriod = "daily",
): RenderedDigest {
  const zone = timeZone?.trim() || DEFAULT_TIME_ZONE;
  const count = items.length;
  // Words where words will do (Wave-1 carry, backend r3-M1). A number in a
  // subject line is a count of obligations, and she is not working a queue.
  const subject = count === 1
    ? "One reminder from Patina"
    : "A few reminders from Patina";

  const sections = CATEGORY_ORDER.map((category) => {
    const group = items.filter((i) => i.category === category);
    if (group.length === 0) return "";
    const lis = group
      .map((it) => {
        const label = escapeHtml(it.title || "Update");
        const body = it.link
          ? `<a href="${it.link}" style="color:#4E7A66;text-decoration:underline;">${label}</a>`
          : label;
        return `<li style="margin:0 0 8px;color:#4B463E;font-family:${SANS};font-size:15px;line-height:1.5;">${body}${
          renderArtifactCitation(it.artifact, zone)
        }</li>`;
      })
      .join("");
    return `
      <div style="margin:0 0 24px;">
        <h2 style="color:#1F1B16;font-family:${SERIF};font-size:17px;font-weight:600;letter-spacing:-0.01em;margin:0 0 8px;">${
      CATEGORY_LABELS[category]
    }</h2>
        <ul style="padding-left:18px;margin:0;">${lis}</ul>
      </div>`;
  }).join("");

  const title = period === "weekly_sunday"
    ? "Your Sunday summary"
    : "Your daily summary";
  const footer = period === "weekly_sunday"
    ? "You're getting one summary a week, on Sunday, instead of individual reminders. Change this anytime in your notification settings."
    : "You're getting one daily summary instead of individual reminders. Change this anytime in your notification settings.";

  const body = heading(title) +
    paragraph(
      count === 1 ? "One thing is waiting for you." : "A few things are waiting for you.",
    ) +
    (sections || paragraph("Nothing new right now.")) +
    spacer(6) +
    ctaButton(baseUrl, "Open Patina") +
    spacer(10) +
    muted(footer);

  const html = renderBrandedShell({
    title,
    eyebrow: "Reminders",
    audience: "client",
    body,
  });

  return { subject, html };
}
