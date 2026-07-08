// Pure, side-effect-free helpers for the notification-digest edge function.
// Extracted so they can be unit-tested with `deno test` without a live DB.

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
          ? `<a href="${it.link}" style="color:#2c2926;text-decoration:underline;">${label}</a>`
          : label;
        return `<li style="margin:0 0 8px;color:#3D3A36;font-size:14px;line-height:1.5;">${body}</li>`;
      })
      .join("");
    return `
      <div style="margin:0 0 24px;">
        <h2 style="color:#2C2926;font-size:16px;font-weight:600;margin:0 0 8px;">${CATEGORY_LABELS[category]}</h2>
        <ul style="padding-left:18px;margin:0;">${lis}</ul>
      </div>`;
  }).join("");

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="background:#FAF7F2;font-family:Inter,Helvetica,Arial,sans-serif;margin:0;padding:0;">
      <div style="max-width:600px;margin:0 auto;background:#fff;">
        <div style="background:linear-gradient(135deg,#C4A57B,#8B7355);padding:32px 40px;text-align:center;">
          <span style="color:#fff;font-size:24px;font-weight:600;letter-spacing:2px;">Patina</span>
        </div>
        <div style="padding:32px 40px;">
          <h1 style="color:#2C2926;font-size:22px;font-weight:600;margin:0 0 8px;">Your daily summary</h1>
          <p style="color:#7A736C;font-size:13px;margin:0 0 24px;">A few things are waiting for you.</p>
          ${sections || '<p style="color:#7A736C;">Nothing new right now.</p>'}
          <div style="text-align:center;margin:32px 0 0;">
            <a href="${baseUrl}" style="display:inline-block;background:#2C2926;color:#fff;padding:12px 28px;border-radius:24px;text-decoration:none;font-weight:600;font-size:14px;">Open Patina</a>
          </div>
        </div>
        <div style="background:#2C2926;padding:24px 40px;text-align:center;">
          <p style="color:#A09890;font-size:12px;margin:0 0 4px;">You're getting one daily summary instead of individual reminders.</p>
          <p style="color:#7A736C;font-size:11px;margin:0;">Change this anytime in your notification settings.</p>
        </div>
      </div>
    </body>
    </html>`;

  return { subject, html };
}
