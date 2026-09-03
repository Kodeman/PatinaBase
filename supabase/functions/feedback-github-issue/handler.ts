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
// short reason in github_issue_error otherwise — because the widget's
// Past-notes tab surfaces both and a silent failure would look like a hang.
// The reason is deliberately terse (`github 422`): GitHub's response body can
// echo request content, and the row is readable by its author.
//
// The request-handling lives here, behind an injectable `deps`, so index.test.ts
// can drive it without a network, a stack, or Deno.serve; index.ts is only the
// Deno.serve wrapper.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildIssueBody, buildIssueTitle, type FeedbackRow } from "./lib.ts";

const SCREENSHOT_BUCKET = "feedback-screenshots";
// Two weeks: long enough for a triage cycle, short enough that a link pasted
// into a public issue stops working soon. The body prints the storage path so
// the link can be re-signed afterwards.
const SCREENSHOT_TTL_SECONDS = 14 * 24 * 60 * 60;

const ISSUE_LABELS = ["tester-report", "bug"];

/** The claim marker: one invocation at a time may talk to GitHub for a row. */
const CLAIM = "filing";
/**
 * How long a claim holds. A crash between the claim and the write-back would
 * otherwise strand the row in `filing` forever, and every retry would decline
 * it as "another invocation is filing this row". Longer than any plausible
 * GitHub call, short enough that a stuck row recovers on its own.
 */
const CLAIM_TTL_MS = 5 * 60 * 1000;

// deno-lint-ignore no-explicit-any
type SupabaseLike = any;

export interface HandlerDeps {
  createClient: (url: string, key: string) => SupabaseLike;
  fetch: typeof fetch;
  env: (key: string) => string | undefined;
}

export const defaultDeps: HandlerDeps = {
  createClient: (url, key) => createClient(url, key),
  fetch: (input, init) => fetch(input, init),
  env: (key) => Deno.env.get(key),
};

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

export async function handler(
  req: Request,
  deps: HandlerDeps = defaultDeps,
): Promise<Response> {
  // ── method: the trigger POSTs; nothing else has business here ──────────────
  if (req.method !== "POST") {
    return json({ ok: false, error: "method not allowed" }, 405);
  }

  // ── auth: gateway already verified the JWT; require role=service_role ──────
  const role = decodeJwtRole(req.headers.get("Authorization"));
  if (role !== "service_role") {
    return json({ ok: false, error: "forbidden: service_role required" }, 403);
  }

  const admin = deps.createClient(
    deps.env("SUPABASE_URL") ?? "",
    deps.env("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

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
    return json({
      ok: true,
      skipped: "issue already filed",
      number: feedback.github_issue_number,
    });
  }

  async function fail(reason: string, status = 200): Promise<Response> {
    await admin
      .from("feedback")
      .update({ github_issue_error: reason })
      .eq("id", feedbackId)
      .is("github_issue_number", null);
    return json({ ok: false, error: reason }, status);
  }

  const githubToken = deps.env("GITHUB_TOKEN") ?? "";
  const githubRepo = deps.env("GITHUB_REPO") || "Kodeman/PatinaBase";
  if (!githubToken) return await fail("GITHUB_TOKEN not configured");

  // ── claim the row before talking to GitHub ────────────────────────────────
  // invoke_edge_function is fire-and-forget and a retry is always possible, so
  // two invocations can meet on one row. The guarded update is the lock: only
  // the caller whose UPDATE actually matched a row goes on to file.
  // The claim stamps `updated_at` so a later invocation can tell a live claim
  // from a stranded one: an unclaimed row, a row whose error is something else
  // (a retry after a failure), or a claim older than CLAIM_TTL_MS all qualify.
  const now = new Date();
  const staleBefore = new Date(now.getTime() - CLAIM_TTL_MS).toISOString();
  const { data: claimed, error: claimErr } = await admin
    .from("feedback")
    .update({
      github_issue_error: CLAIM,
      updated_at: now.toISOString(),
    })
    .eq("id", feedbackId)
    .is("github_issue_number", null)
    .or(
      `github_issue_error.is.null,github_issue_error.neq.${CLAIM},` +
        `and(github_issue_error.eq.${CLAIM},updated_at.lt.${staleBefore})`,
    )
    .select("id");
  if (claimErr) return json({ ok: false, error: claimErr.message }, 500);
  if (!claimed || claimed.length === 0) {
    return json({ ok: true, skipped: "another invocation is filing this row" });
  }

  // Author, for the issue byline. A missing profile is not fatal.
  const { data: profile } = await admin
    .from("profiles")
    .select("email, full_name, display_name")
    .eq("id", feedback.created_by)
    .maybeSingle();

  // Only sign a path the author actually owns. The path is client-supplied on
  // insert, so an unowned one is a request to read someone else's storage —
  // the issue says so instead of carrying a link.
  let screenshotUrl: string | null = null;
  let screenshotNote: string | null = null;
  if (feedback.screenshot_path) {
    if (feedback.screenshot_path.startsWith(`${feedback.created_by}/`)) {
      const { data: signed } = await admin.storage
        .from(SCREENSHOT_BUCKET)
        .createSignedUrl(feedback.screenshot_path, SCREENSHOT_TTL_SECONDS);
      screenshotUrl = signed?.signedUrl ?? null;
    } else {
      screenshotNote = "screenshot path not owned by author";
    }
  }

  const title = buildIssueTitle(feedback);
  const issueBody = buildIssueBody({
    row: feedback,
    authorEmail: profile?.email ?? null,
    authorName: profile?.full_name ?? profile?.display_name ?? null,
    screenshotUrl,
    screenshotNote,
  });

  let res: Response;
  try {
    res = await deps.fetch(`https://api.github.com/repos/${githubRepo}/issues`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "patina-feedback-github-issue",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title, body: issueBody, labels: ISSUE_LABELS }),
    });
  } catch (e) {
    console.error("feedback-github-issue: request failed", String(e).slice(0, 500));
    return await fail("github request failed", 502);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(
      `feedback-github-issue: github ${res.status}`,
      text.slice(0, 500),
    );
    return await fail(`github ${res.status}`, 502);
  }

  const issue = await res.json().catch(() => null);
  const number = issue?.number ?? null;
  const url = issue?.html_url ?? null;
  if (!number) return await fail("github response had no issue number", 502);

  const { data: written, error: writeErr } = await admin
    .from("feedback")
    .update({
      github_issue_number: number,
      github_issue_url: url,
      github_issue_error: null,
    })
    .eq("id", feedbackId)
    // Same guard as the claim: a row that already carries a number belongs to
    // whichever invocation filed it, and its link must not be overwritten.
    .is("github_issue_number", null)
    .select("id");
  if (writeErr) return json({ ok: false, error: writeErr.message, number, url }, 500);

  if (!written || written.length === 0) {
    // The claim should make this unreachable, but a stale claim (CLAIM_TTL_MS)
    // can let a second invocation through to file its own GitHub issue before
    // the first writes back — this row now already carries someone else's
    // issue number, and this invocation's #${number} is an orphaned duplicate
    // on GitHub with no link home in the row.
    const { data: existing } = await admin
      .from("feedback")
      .select("github_issue_number")
      .eq("id", feedbackId)
      .maybeSingle();
    console.error(
      `feedback-github-issue: lost the write-back race for ${feedbackId} — ` +
        `filed #${number}, but the row already carries #${existing?.github_issue_number ?? "unknown"}`,
    );
    return json({ ok: false, error: "lost-race", number, url }, 409);
  }

  return json({ ok: true, number, url });
}
