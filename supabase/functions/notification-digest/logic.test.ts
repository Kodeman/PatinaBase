// Deno tests for the pure notification-digest helpers.
// Run: deno test supabase/functions/notification-digest/logic.test.ts

import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  artifactCitationsForDigest,
  buildReminderDigestEmail,
  decisionDigestLink,
  decisionDigestTitle,
  digestCategoryForDecision,
  digestWindowStart,
  directlyMailedDecisionIds,
  directMailWindowStart,
  dropDecisionsPastOverdue,
  dropDirectlyMailedDecisions,
  dropSnoozedDecisions,
  isDigestDue,
  isReminderDigestDue,
  isSundayLocal,
  type ReminderDigestItem,
} from "./logic.ts";
import { clientDecisionLink } from "../_shared/client-portal-links.ts";

const NOW = new Date("2026-07-07T15:00:00Z");

Deno.test("isReminderDigestDue: true when never sent", () => {
  assertEquals(isReminderDigestDue(null, NOW), true);
  assertEquals(isReminderDigestDue(undefined, NOW), true);
});

Deno.test("isReminderDigestDue: true when last send is older than 20h", () => {
  const lastSent = new Date(NOW.getTime() - 21 * 60 * 60 * 1000).toISOString();
  assertEquals(isReminderDigestDue(lastSent, NOW), true);
});

Deno.test("isReminderDigestDue: false when a digest went out within 20h (cron retry guard)", () => {
  const lastSent = new Date(NOW.getTime() - 5 * 60 * 60 * 1000).toISOString();
  assertEquals(isReminderDigestDue(lastSent, NOW), false);
});

Deno.test("isReminderDigestDue: true for an unparseable watermark", () => {
  assertEquals(isReminderDigestDue("not-a-date", NOW), true);
});

Deno.test("buildReminderDigestEmail: the subject counts in words, never numerals", () => {
  const one = buildReminderDigestEmail(
    [{
      category: "proposal",
      title: "Living Room Refresh",
      link: "https://x/p/1",
    }],
    "https://client.patina.cloud",
  );
  assertEquals(one.subject, "One reminder from Patina");

  const many = buildReminderDigestEmail(
    [
      { category: "proposal", title: "A", link: null },
      { category: "approval", title: "B", link: null },
    ],
    "https://client.patina.cloud",
  );
  assertEquals(many.subject, "A few reminders from Patina");
  assert(!/[0-9]/.test(many.subject), "no numerals in a subject line");
});

Deno.test("buildReminderDigestEmail: lists every item and groups by category", () => {
  const items: ReminderDigestItem[] = [
    {
      category: "proposal",
      title: "Living Room Refresh",
      link: "https://x/p/1",
    },
    {
      category: "approval",
      title: "Approve the issued set",
      link: "https://x/d/9",
    },
    {
      category: "choice",
      title: "Pick a sofa fabric",
      link: "https://x/d/8",
    },
  ];
  const { html } = buildReminderDigestEmail(
    items,
    "https://client.patina.cloud",
  );
  assertStringIncludes(html, "Living Room Refresh");
  assertStringIncludes(html, "Approve the issued set");
  assertStringIncludes(html, "Pick a sofa fabric");
  assertStringIncludes(html, "https://x/p/1");
  // The ask and the choice get their own headings (Wave-1 carry, r3-M1).
  assertStringIncludes(html.toLowerCase(), "proposal");
  assertStringIncludes(html, "Approvals that need you");
  assertStringIncludes(html, "Choices that need you");
  assert(
    !html.includes("Decisions that need you"),
    "an approval is never called a decision",
  );
});

Deno.test("buildReminderDigestEmail: escapes HTML in titles", () => {
  const { html } = buildReminderDigestEmail(
    [{ category: "proposal", title: "<script>alert(1)</script>", link: null }],
    "https://client.patina.cloud",
  );
  assert(!html.includes("<script>alert(1)</script>"));
  assertStringIncludes(html, "&lt;script&gt;");
});

Deno.test("the digest never says 'overdue' to a homeowner (P-04)", () => {
  assertEquals(
    decisionDigestTitle("decision_overdue", "The kitchen plan set"),
    "Still open: The kitchen plan set",
  );
  assertEquals(
    decisionDigestTitle("decision_required", "The kitchen plan set"),
    "The kitchen plan set",
  );
  const { html } = buildReminderDigestEmail(
    [{
      category: "approval",
      title: decisionDigestTitle("decision_overdue", "The kitchen plan set"),
      link: null,
    }],
    "https://client.patina.cloud",
  );
  assert(!html.toLowerCase().includes("overdue"));
  assertStringIncludes(html, "Still open: The kitchen plan set");
});

Deno.test("the digest is addressed to the homeowner's own door (P-03b)", () => {
  const { html } = buildReminderDigestEmail(
    [{ category: "proposal", title: "A", link: null }],
    "https://client.patina.cloud",
  );
  assert(!html.includes(">Dashboard</a>"));
  assert(!html.includes("app.patina.cloud"));
  assertStringIncludes(html, ">Your project</a>");
});

Deno.test("Stage-2 digest item cites the edition, not the checksum (R6)", () => {
  const checksum = "c".repeat(64);
  const items: ReminderDigestItem[] = [{
    category: "approval",
    title: "Approve the issue",
    link: "https://client.patina.cloud/projects/project-1#doorstep",
    decisionId: "decision-1",
    artifact: {
      kind: "spec_book_artifact",
      version: 6,
      checksum,
      title: "Client <specification> book",
      issuedAt: "2026-09-28T14:00:00Z",
    },
  }];
  const { html } = buildReminderDigestEmail(
    items,
    "https://client.patina.cloud",
  );
  assertStringIncludes(html, "Edition 6 · issued September 28");
  assert(!html.includes(checksum), "the hash stays in the record");
  assert(!html.includes("SHA-256"));
  assert(!html.includes("spec_book_artifact"), "the enum spelling is not her word");
  assertStringIncludes(html, "Client &lt;specification&gt; book");

  const citations = artifactCitationsForDigest(items);
  assertEquals(citations, [{
    decisionId: "decision-1",
    artifactKind: "spec_book_artifact",
    artifactVersion: 6,
    artifactChecksum: checksum,
    artifactTitle: "Client <specification> book",
  }]);
  const serialized = JSON.stringify(citations).toLowerCase();
  assert(!serialized.includes("reviewer"));
  assert(!serialized.includes("approver"));
  assert(!serialized.includes("leadid"));
});

Deno.test("the digest addresses an approval exactly as the letter does (F12)", () => {
  const base = "https://client.patina.cloud";
  assertEquals(
    decisionDigestLink(base, "decision-1"),
    clientDecisionLink(base, "decision-1"),
  );
  assertEquals(
    decisionDigestLink(base, "decision-1"),
    "https://client.patina.cloud/decisions/decision-1",
  );
  // A missing or forged id lands on the doorstep, never an interpolated path.
  assertEquals(decisionDigestLink(base, null), `${base}/#doorstep`);
  assertEquals(decisionDigestLink(base, "../evil"), `${base}/#doorstep`);
});

// ── P-28. "Once a week, on Sunday" — hers, not the cron's ──────────────────

Deno.test("the weekly digest waits for Sunday in HER zone", () => {
  // 2026-10-12T02:00Z: Monday in UTC, Sunday evening in Los Angeles.
  const at = new Date("2026-10-12T02:00:00Z");
  assertEquals(isSundayLocal(at, "America/Los_Angeles"), true);
  assertEquals(isSundayLocal(at, "UTC"), false);
  assertEquals(isDigestDue("weekly_sunday", null, at, "America/Los_Angeles"), true);
  assertEquals(isDigestDue("weekly_sunday", null, at, "UTC"), false);
});

Deno.test("the weekly digest fires once a week, the daily one once a day", () => {
  const sunday = new Date("2026-10-11T15:00:00Z");
  // Sent two days ago — a week has not passed.
  assertEquals(
    isDigestDue("weekly_sunday", "2026-10-09T15:00:00Z", sunday, "UTC"),
    false,
  );
  // Sent last Sunday — six days is enough to fire on the same weekday again.
  assertEquals(
    isDigestDue("weekly_sunday", "2026-10-04T15:00:00Z", sunday, "UTC"),
    true,
  );
  // The daily cadence keeps its own 20h guard, untouched — read on a Monday,
  // because Sunday is now its own refusal (below).
  const monday = new Date("2026-10-12T15:00:00Z");
  assertEquals(
    isDigestDue("daily", "2026-10-12T10:00:00Z", monday, "UTC"),
    false,
  );
  assertEquals(
    isDigestDue("daily", "2026-10-11T10:00:00Z", monday, "UTC"),
    true,
  );
});

// ── r1 M3. The summary keeps the same hours as the letter ─────────────────

Deno.test("no summary on a Sunday for the cadences that are not Sunday's", () => {
  const sunday = new Date("2026-10-11T15:00:00Z");
  assertEquals(isDigestDue("daily", null, sunday, "UTC"), false);
  // Monday morning it goes out, as ux/03 promises.
  assertEquals(
    isDigestDue("daily", null, new Date("2026-10-12T13:00:00Z"), "UTC"),
    true,
  );
  // The Sunday cadence is the exception: Sunday is the day she asked for.
  assertEquals(isDigestDue("weekly_sunday", null, sunday, "UTC"), true);
});

Deno.test("no summary before 8am in her own zone, either cadence", () => {
  // 15:00 UTC is 07:00 in Los Angeles in winter — the hour the old daily cron
  // would have mailed her every single day.
  const winterRun = new Date("2026-01-12T15:00:00Z"); // Monday
  assertEquals(isDigestDue("daily", null, winterRun, "America/Los_Angeles"), false);
  assertEquals(isDigestDue("daily", null, winterRun, "America/New_York"), true);

  // The Sunday summary must not land at midnight in Tokyo.
  const tokyoMidnight = new Date("2026-10-10T15:00:00Z"); // Sunday 00:00 JST
  assertEquals(isDigestDue("weekly_sunday", null, tokyoMidnight, "Asia/Tokyo"), false);
  const tokyoMorning = new Date("2026-10-10T23:00:00Z"); // Sunday 08:00 JST
  assertEquals(isDigestDue("weekly_sunday", null, tokyoMorning, "Asia/Tokyo"), true);
});

Deno.test("the window stretches over a run that was skipped", () => {
  const monday = new Date("2026-10-12T13:00:00Z");
  // Nothing sent yet: one ordinary period back.
  assertEquals(
    digestWindowStart("daily", null, monday).toISOString(),
    "2026-10-11T13:00:00.000Z",
  );
  // Last summary went out on Saturday — Sunday was skipped, so Monday's
  // window reaches back to Saturday and Saturday's reminders survive.
  assertEquals(
    digestWindowStart("daily", "2026-10-10T13:00:00Z", monday).toISOString(),
    "2026-10-10T13:00:00.000Z",
  );
  // A summary sent an hour ago never shrinks the window below its period.
  assertEquals(
    digestWindowStart("daily", "2026-10-12T12:00:00Z", monday).toISOString(),
    "2026-10-11T13:00:00.000Z",
  );
  // And it never reaches back further than a fortnight.
  assertEquals(
    digestWindowStart("weekly_sunday", "2026-01-01T13:00:00Z", monday)
      .toISOString(),
    "2026-09-28T13:00:00.000Z",
  );
});

// ── r1 B1. The snooze reaches the summary, not only the letter ────────────

Deno.test("a snoozed approval is not in her summary either (P-28, R16)", () => {
  const items: ReminderDigestItem[] = [
    { category: "proposal", title: "A", link: null },
    { category: "approval", title: "B", link: null, decisionId: "d-1" },
    { category: "choice", title: "C", link: null, decisionId: "d-2" },
  ];
  assertEquals(dropSnoozedDecisions(items, []).length, 3);
  const quiet = dropSnoozedDecisions(items, ["d-1"]);
  assertEquals(quiet.length, 2);
  assert(!quiet.some((item) => item.decisionId === "d-1"));
  // Her snooze is per-approval: the other ask still stands in the summary,
  // and a proposal nudge carries no decision id to be swept up with them.
  assert(quiet.some((item) => item.decisionId === "d-2"));
  assert(quiet.some((item) => item.category === "proposal"));
});

Deno.test("the ask and the choice are sorted by their contract, never by guess", () => {
  assertEquals(digestCategoryForDecision("project_artifact_v1"), "approval");
  assertEquals(digestCategoryForDecision("legacy_option_v1"), "choice");
  assertEquals(digestCategoryForDecision(null), "choice");
  assertEquals(digestCategoryForDecision(undefined), "choice");
});

Deno.test("an approval past its overdue notice leaves the summary too (R16)", () => {
  const items: ReminderDigestItem[] = [
    { category: "proposal", title: "A", link: null },
    { category: "approval", title: "B", link: null, decisionId: "d-1" },
    { category: "choice", title: "C", link: null, decisionId: "d-2" },
  ];
  assertEquals(dropDecisionsPastOverdue(items, []).length, 3);
  const quiet = dropDecisionsPastOverdue(items, ["d-1"]);
  assertEquals(quiet.length, 2);
  assert(!quiet.some((item) => item.decisionId === "d-1"));
  // A proposal nudge carries no decision id and is never swept up with them.
  assert(quiet.some((item) => item.category === "proposal"));
});

Deno.test("the Sunday summary says which summary it is", () => {
  const items: ReminderDigestItem[] = [
    { category: "approval", title: "Approve the issued set", link: null },
  ];
  const weekly = buildReminderDigestEmail(
    items,
    "https://client.patina.cloud",
    "America/New_York",
    "weekly_sunday",
  );
  assertStringIncludes(weekly.html, "Your Sunday summary");
  assertStringIncludes(weekly.html, "one summary a week, on Sunday");
  assertEquals(weekly.subject, "One reminder from Patina");

  const daily = buildReminderDigestEmail(
    items,
    "https://client.patina.cloud",
    "America/New_York",
  );
  assertStringIncludes(daily.html, "Your daily summary");
  assert(!daily.html.includes("Your Sunday summary"));
});

// ── One approval, one letter inside a day (r2 M-R2-02) ─────────────────────

Deno.test("an approval already mailed direct is not repeated in the summary", () => {
  const items: ReminderDigestItem[] = [
    {
      category: "approval",
      title: "Approve the issued set",
      link: null,
      decisionId: "d-announced",
    },
    {
      category: "choice",
      title: "Pick a pull",
      link: null,
      decisionId: "d-quiet",
    },
    { category: "proposal", title: "A proposal is waiting", link: null },
  ];
  const kept = dropDirectlyMailedDecisions(items, ["d-announced"]);
  assertEquals(kept.length, 2);
  assertEquals(kept[0].decisionId, "d-quiet");
  // A proposal nudge carries no decisionId and is never touched by this.
  assertEquals(kept[1].category, "proposal");
  // Nothing mailed, nothing dropped — and the same array back.
  assertEquals(dropDirectlyMailedDecisions(items, []), items);
});

Deno.test("only a letter that actually left silences the summary", () => {
  const rows = [
    { status: "sent", metadata: { decisionId: "d-sent" } },
    { status: "delivered", metadata: { decisionId: "d-delivered" } },
    { status: "sending", metadata: { decisionId: "d-sending" } },
    // Neither of these reached her, so the summary is still the only thing
    // that will mention the approval.
    { status: "failed", metadata: { decisionId: "d-failed" } },
    { status: "suppressed", metadata: { decisionId: "d-suppressed" } },
    // Malformed envelopes are simply not evidence of anything.
    { status: "sent", metadata: null },
    { status: "sent", metadata: { decisionId: 7 } as never },
  ];
  const ids = directlyMailedDecisionIds(rows);
  assertEquals(ids.sort(), ["d-delivered", "d-sending", "d-sent"]);
});

// ── M-R3-01. §282 counts days, not periods ────────────────────────────────

Deno.test("the already-mailed filter looks back a day, whatever the period", () => {
  const sunday = new Date("2026-10-11T13:00:00Z");

  // The weekly window is a week; the filter over it is still a day.
  const weekly = digestWindowStart(
    "weekly_sunday",
    "2026-10-04T13:00:00Z",
    sunday,
  );
  assertEquals(weekly.toISOString(), "2026-10-04T13:00:00.000Z");
  assertEquals(
    directMailWindowStart(weekly, sunday).toISOString(),
    "2026-10-10T13:00:00.000Z",
  );

  // A daily window and the floor are the same instant, which is why the
  // daily tests never caught this.
  const monday = new Date("2026-10-12T13:00:00Z");
  assertEquals(
    directMailWindowStart(digestWindowStart("daily", null, monday), monday)
      .toISOString(),
    "2026-10-11T13:00:00.000Z",
  );

  // A daily window stretched over the skipped Sunday run still floors at a day.
  assertEquals(
    directMailWindowStart(
      digestWindowStart("daily", "2026-10-10T13:00:00Z", monday),
      monday,
    ).toISOString(),
    "2026-10-11T13:00:00.000Z",
  );

  // A window narrower than a day is left alone — the floor is a floor, and a
  // letter mailed inside it must still silence the summary.
  assertEquals(
    directMailWindowStart("2026-10-12T09:00:00Z", monday).toISOString(),
    "2026-10-12T09:00:00.000Z",
  );
  // An unreadable watermark falls back to the day, never to the epoch.
  assertEquals(
    directMailWindowStart("not-a-date", monday).toISOString(),
    "2026-10-11T13:00:00.000Z",
  );
});

Deno.test("an approval announced mid-week is in the Sunday summary (M-R3-01)", () => {
  const sunday = new Date("2026-10-11T13:00:00Z"); // 9am New York
  const lastSummary = "2026-10-04T13:00:00Z";

  const items: ReminderDigestItem[] = [
    {
      category: "approval",
      title: "Approve the issued set",
      link: null,
      decisionId: "d-wednesday",
    },
    {
      category: "approval",
      title: "Approve the stair detail",
      link: null,
      decisionId: "d-this-morning",
    },
  ];

  // Every approval mails its first notice direct, so both have a
  // `decision_required` email row inside the seven-day window.
  const mailLog = [
    {
      created_at: "2026-10-07T20:00:00Z", // Wednesday's announcement
      status: "delivered",
      metadata: { decisionId: "d-wednesday" },
    },
    {
      created_at: "2026-10-11T11:00:00Z", // two hours before this summary
      status: "delivered",
      metadata: { decisionId: "d-this-morning" },
    },
  ];

  const floor = directMailWindowStart(
    digestWindowStart("weekly_sunday", lastSummary, sunday),
    sunday,
  );
  // What the query in index.ts returns: `.gt("created_at", floor)`.
  const rowsInWindow = mailLog.filter(
    (row) => new Date(row.created_at) > floor,
  );
  const kept = dropDirectlyMailedDecisions(
    items,
    directlyMailedDecisionIds(rowsInWindow),
  );

  // The week's announcement is old news; the summary is the only thing that
  // will mention that approval again before its date.
  assertEquals(kept.length, 1);
  assertEquals(kept[0].decisionId, "d-wednesday");

  // And the one announced two hours ago is still not said twice in a day.
  assert(!kept.some((item) => item.decisionId === "d-this-morning"));
});
