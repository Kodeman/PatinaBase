// Pure issue-rendering for feedback-github-issue. Kept free of Deno/Supabase
// imports so it unit-tests without permissions or a stack (lib.test.ts).

export interface FeedbackRow {
  id: string;
  created_at: string;
  created_by: string;
  bucket: string;
  note: string | null;
  weight: string | null;
  screen_name: string | null;
  route: string | null;
  app_version: string | null;
  viewport: string | null;
  user_agent: string | null;
  screenshot_path: string | null;
  report_kind: string;
  github_issue_number: number | null;
  github_issue_url: string | null;
  github_issue_error: string | null;
}

/** The four buckets, labelled as the portal labels them (lib/document/feedback.ts). */
const BUCKET_LABELS: Record<string, string> = {
  working: "Working",
  not_working: "Not working",
  missing: "Missing",
  change: "Change",
};

export const TITLE_NOTE_MAX = 60;

export function bucketLabel(bucket: string | null | undefined): string {
  if (!bucket) return "Note";
  return BUCKET_LABELS[bucket] ?? bucket;
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * `[Tester] <screen>: <note>` — the note collapsed to one line and cut at
 * TITLE_NOTE_MAX, falling back to the bucket label when the note is empty.
 */
export function buildIssueTitle(row: Pick<FeedbackRow, "screen_name" | "note" | "bucket">): string {
  const screen = row.screen_name?.trim() || "Portal";
  const note = collapse(row.note ?? "");
  let subject: string;
  if (note.length === 0) {
    subject = bucketLabel(row.bucket);
  } else if (note.length > TITLE_NOTE_MAX) {
    subject = `${note.slice(0, TITLE_NOTE_MAX).trimEnd()}…`;
  } else {
    subject = note;
  }
  return `[Tester] ${screen}: ${subject}`;
}

export interface IssueBodyInput {
  row: FeedbackRow;
  authorEmail?: string | null;
  authorName?: string | null;
  screenshotUrl?: string | null;
}

function cell(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value).trim();
  return s.length > 0 ? s : "—";
}

export function buildIssueBody({
  row,
  authorEmail,
  authorName,
  screenshotUrl,
}: IssueBodyInput): string {
  const author = [authorName?.trim(), authorEmail?.trim()]
    .filter((v) => v && v.length > 0)
    .join(" · ");

  const lines: string[] = [];
  lines.push("**Reported from the Patina designer portal (Tester Notes).**");
  lines.push("");
  lines.push(row.note?.trim() ? `> ${collapse(row.note)}` : "_(bucket only — no note)_");
  lines.push("");
  lines.push("| Field | Value |");
  lines.push("| --- | --- |");
  lines.push(`| Bucket | ${cell(bucketLabel(row.bucket))} |`);
  lines.push(`| Weight | ${cell(row.weight)} |`);
  lines.push(`| Screen | ${cell(row.screen_name)} |`);
  lines.push(`| Route | ${cell(row.route)} |`);
  lines.push(`| Viewport | ${cell(row.viewport)} |`);
  lines.push(`| App version | ${cell(row.app_version)} |`);
  lines.push(`| User agent | ${cell(row.user_agent)} |`);
  lines.push(`| Author | ${cell(author || row.created_by)} |`);
  lines.push(`| Created at | ${cell(row.created_at)} |`);
  lines.push(`| Feedback id | \`${cell(row.id)}\` |`);
  lines.push(`| Screenshot path | ${cell(row.screenshot_path)} |`);
  lines.push("");
  lines.push("### Screenshot");
  if (screenshotUrl) {
    // The signed link expires; the storage path above lets it be re-signed.
    lines.push(`[Open the captured screen](${screenshotUrl})`);
  } else {
    lines.push("none");
  }
  lines.push("");
  return lines.join("\n");
}
