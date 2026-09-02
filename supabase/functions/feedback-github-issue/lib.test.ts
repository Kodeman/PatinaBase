import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { buildIssueBody, buildIssueTitle, TITLE_NOTE_MAX, type FeedbackRow } from "./lib.ts";

function row(overrides: Partial<FeedbackRow> = {}): FeedbackRow {
  return {
    id: "11111111-2222-3333-4444-555555555555",
    created_at: "2026-09-02T17:04:00.000Z",
    created_by: "99999999-8888-7777-6666-555555555555",
    bucket: "not_working",
    note: "The proposal total shows zero after I remove the last line item.",
    weight: "high",
    screen_name: "Document",
    route: "/doc/abc-123",
    app_version: "2026.09.02",
    viewport: "1512x857",
    user_agent: "Mozilla/5.0 (Macintosh) Safari/605.1.15",
    screenshot_path: "99999999/11111111.png",
    report_kind: "bug",
    github_issue_number: null,
    github_issue_url: null,
    github_issue_error: null,
    ...overrides,
  };
}

Deno.test("buildIssueTitle truncates a long note at TITLE_NOTE_MAX", () => {
  const note = "x".repeat(200);
  const title = buildIssueTitle(row({ note }));
  assertEquals(title, `[Tester] Document: ${"x".repeat(TITLE_NOTE_MAX)}…`);
});

Deno.test("buildIssueTitle keeps a short note whole and collapses whitespace", () => {
  const title = buildIssueTitle(row({ note: "  Totals   go\nblank " }));
  assertEquals(title, "[Tester] Document: Totals go blank");
});

Deno.test("buildIssueTitle falls back to the bucket label when there is no note", () => {
  assertEquals(buildIssueTitle(row({ note: null })), "[Tester] Document: Not working");
  assertEquals(buildIssueTitle(row({ note: "   " })), "[Tester] Document: Not working");
});

Deno.test("buildIssueTitle falls back to Portal when the screen is unknown", () => {
  assertEquals(
    buildIssueTitle(row({ screen_name: null, note: "Broken" })),
    "[Tester] Portal: Broken",
  );
});

Deno.test("buildIssueBody carries every captured field", () => {
  const body = buildIssueBody({
    row: row(),
    authorEmail: "leah@example.com",
    authorName: "Leah",
    screenshotUrl: "https://signed.example/shot.png",
  });
  assertStringIncludes(body, "The proposal total shows zero");
  assertStringIncludes(body, "Not working");
  assertStringIncludes(body, "high");
  assertStringIncludes(body, "Document");
  assertStringIncludes(body, "/doc/abc-123");
  assertStringIncludes(body, "1512x857");
  assertStringIncludes(body, "2026.09.02");
  assertStringIncludes(body, "Safari/605.1.15");
  assertStringIncludes(body, "Leah · leah@example.com");
  assertStringIncludes(body, "2026-09-02T17:04:00.000Z");
  assertStringIncludes(body, "11111111-2222-3333-4444-555555555555");
  assertStringIncludes(body, "99999999/11111111.png");
  assertStringIncludes(body, "[Open the captured screen](https://signed.example/shot.png)");
});

Deno.test("buildIssueBody says none when there is no screenshot link", () => {
  const body = buildIssueBody({ row: row({ screenshot_path: null }), screenshotUrl: null });
  assertStringIncludes(body, "### Screenshot\nnone");
});

Deno.test("buildIssueBody falls back to the author uuid and em-dashes empty cells", () => {
  const body = buildIssueBody({
    row: row({ weight: null, viewport: null, user_agent: null, note: null }),
    authorEmail: null,
    authorName: null,
    screenshotUrl: null,
  });
  assertStringIncludes(body, "99999999-8888-7777-6666-555555555555");
  assertStringIncludes(body, "| Weight | — |");
  assertStringIncludes(body, "| Viewport | — |");
  assertStringIncludes(body, "| User agent | — |");
  assertStringIncludes(body, "_(bucket only — no note)_");
});

Deno.test("buildIssueBody escapes pipes and newlines in client-supplied cells", () => {
  const body = buildIssueBody({
    row: row({
      screen_name: "Doc | Fake",
      route: "/doc/1\n| Injected | row |",
      viewport: "1512|857",
      app_version: "2026.09.02\r\nnext line",
      user_agent: "Mozilla | 5.0",
    }),
    screenshotUrl: null,
  });

  assertStringIncludes(body, "| Screen | Doc \\| Fake |");
  assertStringIncludes(body, "| Route | /doc/1 \\| Injected \\| row \\| |");
  assertStringIncludes(body, "| Viewport | 1512\\|857 |");
  assertStringIncludes(body, "| App version | 2026.09.02 next line |");
  assertStringIncludes(body, "| User agent | Mozilla \\| 5.0 |");
  // One table row per field: the injected pipes never opened a new one.
  assertEquals(body.split("\n").filter((l) => l.startsWith("| Route |")).length, 1);
});

Deno.test("buildIssueBody collapses a multi-line note into the quote", () => {
  const body = buildIssueBody({
    row: row({ note: "Totals\ngo\r\nblank" }),
    screenshotUrl: null,
  });
  assertStringIncludes(body, "> Totals go blank");
});

Deno.test("buildIssueBody prints the reason when a path was not signed", () => {
  const body = buildIssueBody({
    row: row(),
    screenshotUrl: null,
    screenshotNote: "screenshot path not owned by author",
  });
  assertStringIncludes(
    body,
    "### Screenshot\nscreenshot path not owned by author",
  );
});
