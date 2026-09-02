// feedback-github-issue — file a GitHub issue for a feedback row marked as a bug.
//
// Fired by the AFTER INSERT trigger on public.feedback (migration 00558) via
// invoke_edge_function, which passes `{ record: <the feedback row> }` with a
// service-role Bearer. No browser calls it, so there is no CORS block; the
// gateway verifies the JWT (verify_jwt = true) and this function additionally
// REQUIRES role == 'service_role' (parse-room-scan idiom).
//
// The trigger payload is a snapshot, so the row is re-read by id before use.
// Every outcome is written back to the row — an issue number/url on success, a
// human-readable reason in github_issue_error otherwise — because the widget's
// Past-notes tab surfaces both and a silent failure would look like a hang.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildIssueBody, buildIssueTitle, type FeedbackRow } from "./lib.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN") ?? "";
const GITHUB_REPO = Deno.env.get("GITHUB_REPO") || "Kodeman/PatinaBase";

const SCREENSHOT_BUCKET = "feedback-screenshots";
// Long enough that an issue stays useful through a triage cycle; the issue body
// also prints the storage path so the link can be re-signed after it lapses.
const SCREENSHOT_TTL_SECONDS = 90 * 24 * 60 * 60;

const ISSUE_LABELS = ["tester-report", "bug"];

/** Decode a JWT payload (no verification — the gateway already verified it). */
function decodeJwtRole(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const m = authHeader.match(/^bearer\s+(.+)$/i);
  if (!m) return null;
  const parts = m[1].split(".");
  if (parts.length !== 3) return null;
  try {
    let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4 !== 0) b64 += "=";
    const payload = JSON.parse(atob(b64));
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  // ── auth: gateway already verified the JWT; require role=service_role ──────
  const role = decodeJwtRole(req.headers.get("Authorization"));
  if (role !== "service_role") {
    return json({ ok: false, error: "forbidden: service_role required" }, 403);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const body = await req.json().catch(() => ({}));
  const feedbackId = body?.record?.id ?? body?.id;
  if (!feedbackId) return json({ ok: false, error: "record.id required" }, 400);

  // Re-read: the trigger payload is a snapshot taken inside the INSERT.
  const { data: row, error: readErr } = await admin
    .from("feedback")
    .select("*")
    .eq("id", feedbackId)
    .maybeSingle();
  if (readErr) return json({ ok: false, error: readErr.message }, 500);
  if (!row) return json({ ok: false, error: "feedback row not found" }, 404);

  const feedback = row as FeedbackRow;

  if (feedback.report_kind !== "bug") {
    return json({ ok: true, skipped: "not a bug report" });
  }
  if (feedback.github_issue_number) {
    return json({ ok: true, skipped: "issue already filed", number: feedback.github_issue_number });
  }

  async function fail(reason: string): Promise<Response> {
    await admin
      .from("feedback")
      .update({ github_issue_error: reason })
      .eq("id", feedbackId)
      .is("github_issue_number", null);
    return json({ ok: false, error: reason });
  }

  if (!GITHUB_TOKEN) return await fail("GITHUB_TOKEN not configured");

  // Author, for the issue byline. A missing profile is not fatal.
  const { data: profile } = await admin
    .from("profiles")
    .select("email, full_name, display_name")
    .eq("id", feedback.created_by)
    .maybeSingle();

  let screenshotUrl: string | null = null;
  if (feedback.screenshot_path) {
    const { data: signed } = await admin.storage
      .from(SCREENSHOT_BUCKET)
      .createSignedUrl(feedback.screenshot_path, SCREENSHOT_TTL_SECONDS);
    screenshotUrl = signed?.signedUrl ?? null;
  }

  const title = buildIssueTitle(feedback);
  const issueBody = buildIssueBody({
    row: feedback,
    authorEmail: profile?.email ?? null,
    authorName: profile?.full_name ?? profile?.display_name ?? null,
    screenshotUrl,
  });

  let res: Response;
  try {
    res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/issues`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "patina-feedback-github-issue",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title, body: issueBody, labels: ISSUE_LABELS }),
    });
  } catch (e) {
    return await fail(`github request failed: ${String(e).slice(0, 500)}`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return await fail(`github ${res.status}: ${text.slice(0, 500)}`);
  }

  const issue = await res.json().catch(() => null);
  const number = issue?.number ?? null;
  const url = issue?.html_url ?? null;
  if (!number) return await fail("github response had no issue number");

  const { error: writeErr } = await admin
    .from("feedback")
    .update({
      github_issue_number: number,
      github_issue_url: url,
      github_issue_error: null,
    })
    .eq("id", feedbackId);
  if (writeErr) return json({ ok: false, error: writeErr.message, number, url }, 500);

  return json({ ok: true, number, url });
});
