// Pure, side-effect-free helpers for the notification-digest edge function.
// Extracted so they can be unit-tested with `deno test` without a live DB.

import {
  renderBrandedShell,
  heading,
  paragraph,
  muted,
  ctaButton,
  spacer,
} from "../_shared/branded-email.ts";

const SERIF = "'Fraunces', Georgia, 'Times New Roman', serif";
const SANS =
  "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

export type ReminderDigestCategory = "proposal" | "decision";

export interface ReminderDigestItem {
  category: ReminderDigestCategory;
  title: string;
  link: string | null;
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
  decision: "Decisions that need you",
};

// Stable render order.
const CATEGORY_ORDER: ReminderDigestCategory[] = ["proposal", "decision"];

/**
 * Build the single daily reminder digest email from a user's accumulated
 * unread reminder items. Groups by category with a simple bulleted list — no
 * per-item styling flourishes, just a clear "here's what's waiting" summary.
 */
export function buildReminderDigestEmail(
  items: ReminderDigestItem[],
  baseUrl: string,
): RenderedDigest {
  const count = items.length;
  const subject =
    count === 1
      ? "A reminder from Patina"
      : `${count} reminders from Patina`;

  const sections = CATEGORY_ORDER.map((category) => {
    const group = items.filter((i) => i.category === category);
    if (group.length === 0) return "";
    const lis = group
      .map((it) => {
        const label = escapeHtml(it.title || "Update");
        const body = it.link
          ? `<a href="${it.link}" style="color:#4E7A66;text-decoration:underline;">${label}</a>`
          : label;
        return `<li style="margin:0 0 8px;color:#4B463E;font-family:${SANS};font-size:15px;line-height:1.5;">${body}</li>`;
      })
      .join("");
    return `
      <div style="margin:0 0 24px;">
        <h2 style="color:#1F1B16;font-family:${SERIF};font-size:17px;font-weight:600;letter-spacing:-0.01em;margin:0 0 8px;">${CATEGORY_LABELS[category]}</h2>
        <ul style="padding-left:18px;margin:0;">${lis}</ul>
      </div>`;
  }).join("");

  const body =
    heading("Your daily summary") +
    paragraph("A few things are waiting for you.") +
    (sections || paragraph("Nothing new right now.")) +
    spacer(6) +
    ctaButton(baseUrl, "Open Patina") +
    spacer(10) +
    muted(
      "You're getting one daily summary instead of individual reminders. Change this anytime in your notification settings.",
    );

  const html = renderBrandedShell({
    title: "Your daily summary",
    eyebrow: "Reminders",
    body,
  });

  return { subject, html };
}
