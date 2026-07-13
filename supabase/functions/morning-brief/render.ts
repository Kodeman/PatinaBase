// Pure HTML rendering for the morning-brief email (WP-1.3). Compact, inline-
// styled, no external assets — same escape-and-inline-style approach as
// notification-digest/logic.ts's buildReminderDigestEmail. Sections mirror
// daily_briefs.content 1:1 so the email and the dashboard panel never drift.

import type { BriefContent } from "./compose.ts";
import { renderBrandedShell, heading, muted } from "../_shared/branded-email.ts";

const SANS =
  "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
const MONO =
  "'IBM Plex Mono', ui-monospace, SFMono-Regular, 'Courier New', monospace";

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
      <h2 style="color:#4E7A66;font-family:${MONO};font-size:11px;font-weight:600;margin:0 0 8px;letter-spacing:0.14em;text-transform:uppercase;">${escapeHtml(title)}</h2>
      ${bodyHtml}
    </div>`;
}

function line(text: string): string {
  return `<div style="margin:0 0 4px;color:#4B463E;font-family:${SANS};font-size:14px;line-height:1.5;">${text}</div>`;
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
      `<div style="margin:0 0 6px;color:#A24E2E;font-family:${MONO};font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;">Stale</div>` +
        content.exceptions.stale
          .map((e) => line(`${escapeHtml(e.summary)} (${e.age_hours}h)`))
          .join(""),
    );
  }
  if (content.exceptions.failed.length) {
    exceptionsParts.push(
      `<div style="margin:12px 0 6px;color:#A24E2E;font-family:${MONO};font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;">Failed</div>` +
        content.exceptions.failed
          .map((e) => line(`${escapeHtml(e.summary)}${e.last_error ? ` — ${escapeHtml(e.last_error)}` : ""}`))
          .join(""),
    );
  }
  if (content.exceptions.intake_errors.length) {
    exceptionsParts.push(
      `<div style="margin:12px 0 6px;color:#A24E2E;font-family:${MONO};font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;">Intake errors</div>` +
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

  const body =
    heading("Morning Brief") +
    muted(escapeHtml(briefDate)) +
    section("Queue", queueLines) +
    (content.vitals ? section("Vitals", vitalsHtml) : "") +
    section("Today's three", threeHtml) +
    section("Exceptions", exceptionsHtml) +
    section("Runs yesterday", runsLines);

  const html = renderBrandedShell({
    title: "Morning Brief",
    eyebrow: "Daily brief",
    body,
  });

  return html;
}
