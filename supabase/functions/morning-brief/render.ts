// Pure HTML rendering for the morning-brief email (WP-1.3). Compact, inline-
// styled, no external assets — same escape-and-inline-style approach as
// notification-digest/logic.ts's buildReminderDigestEmail. Sections mirror
// daily_briefs.content 1:1 so the email and the dashboard panel never drift.

import type { BriefContent } from "./compose.ts";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function section(title: string, bodyHtml: string): string {
  return `
    <div style="margin:0 0 20px;">
      <h2 style="color:#2C2926;font-size:14px;font-weight:600;margin:0 0 8px;letter-spacing:0.02em;text-transform:uppercase;">${escapeHtml(title)}</h2>
      ${bodyHtml}
    </div>`;
}

function line(text: string): string {
  return `<div style="margin:0 0 4px;color:#3D3A36;font-size:13px;line-height:1.5;">${text}</div>`;
}

export function renderBriefEmailHtml(content: BriefContent, briefDate: string): string {
  const queueLines = content.queue.length
    ? content.queue
        .map((q) => line(`${escapeHtml(q.status)}: <strong>${q.task_count}</strong>${q.oldest_created_at ? ` (oldest ${escapeHtml(new Date(q.oldest_created_at).toLocaleString())})` : ""}`))
        .join("")
    : line("No queue activity.");

  const runsLines = content.runs_yesterday.length
    ? content.runs_yesterday
        .map((r) => {
          const dur = r.duration_ms != null ? `${Math.round(r.duration_ms / 1000)}s` : "—";
          const err = r.error ? ` — ${escapeHtml(r.error)}` : "";
          return line(`${escapeHtml(r.name)}: ${escapeHtml(r.status)} (${dur})${err}`);
        })
        .join("")
    : line("No runs yesterday.");

  const exceptionsParts: string[] = [];
  if (content.exceptions.stale.length) {
    exceptionsParts.push(
      `<div style="margin:0 0 6px;color:#B5654A;font-size:12px;font-weight:600;text-transform:uppercase;">Stale</div>` +
        content.exceptions.stale
          .map((e) => line(`${escapeHtml(e.summary)} (${e.age_hours}h)`))
          .join(""),
    );
  }
  if (content.exceptions.failed.length) {
    exceptionsParts.push(
      `<div style="margin:12px 0 6px;color:#B5654A;font-size:12px;font-weight:600;text-transform:uppercase;">Failed</div>` +
        content.exceptions.failed
          .map((e) => line(`${escapeHtml(e.summary)}${e.last_error ? ` — ${escapeHtml(e.last_error)}` : ""}`))
          .join(""),
    );
  }
  if (content.exceptions.intake_errors.length) {
    exceptionsParts.push(
      `<div style="margin:12px 0 6px;color:#B5654A;font-size:12px;font-weight:600;text-transform:uppercase;">Intake errors</div>` +
        content.exceptions.intake_errors.map((e) => line(escapeHtml(e.summary))).join(""),
    );
  }
  const exceptionsHtml = exceptionsParts.length
    ? exceptionsParts.join("")
    : line("No exceptions.");

  const threeHtml = content.todays_three.length
    ? content.todays_three
        .map((t, i) => line(`${i + 1}. ${escapeHtml(t.summary)} (P${t.priority}${t.assignee ? `, ${escapeHtml(t.assignee)}` : ""})`))
        .join("")
    : line("Nothing awaiting review.");

  const vitalsHtml = content.vitals
    ? Object.entries(content.vitals.current)
        .map(([k, v]) => {
          const delta = content.vitals?.deltas?.[k];
          const deltaStr =
            delta != null ? ` (${delta > 0 ? "+" : ""}${Math.round(delta * 100) / 100})` : "";
          return line(`${escapeHtml(k)}: <strong>${escapeHtml(String(v))}</strong>${deltaStr}`);
        })
        .join("")
    : "";

  const html = `
    <!DOCTYPE html>
    <html>
      <body style="margin:0;padding:0;background:#FAF7F2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
        <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
          <h1 style="color:#2C2926;font-size:20px;font-weight:600;margin:0 0 4px;">Morning Brief</h1>
          <p style="color:#8B7355;font-size:13px;margin:0 0 24px;">${escapeHtml(briefDate)}</p>
          ${section("Queue", queueLines)}
          ${content.vitals ? section("Vitals", vitalsHtml) : ""}
          ${section("Today's three", threeHtml)}
          ${section("Exceptions", exceptionsHtml)}
          ${section("Runs yesterday", runsLines)}
        </div>
      </body>
    </html>`;

  return html;
}
