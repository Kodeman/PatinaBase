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
  decisionDigestTitle,
  isReminderDigestDue,
  type ReminderDigestItem,
} from "./logic.ts";

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

Deno.test("buildReminderDigestEmail: singular vs plural subject", () => {
  const one = buildReminderDigestEmail(
    [{
      category: "proposal",
      title: "Living Room Refresh",
      link: "https://x/p/1",
    }],
    "https://client.patina.cloud",
  );
  assertStringIncludes(one.subject, "reminder");
  assert(!one.subject.includes("2 "));

  const many = buildReminderDigestEmail(
    [
      { category: "proposal", title: "A", link: null },
      { category: "decision", title: "B", link: null },
    ],
    "https://client.patina.cloud",
  );
  assertStringIncludes(many.subject, "2");
});

Deno.test("buildReminderDigestEmail: lists every item and groups by category", () => {
  const items: ReminderDigestItem[] = [
    {
      category: "proposal",
      title: "Living Room Refresh",
      link: "https://x/p/1",
    },
    {
      category: "decision",
      title: "Pick a sofa fabric",
      link: "https://x/d/9",
    },
  ];
  const { html } = buildReminderDigestEmail(
    items,
    "https://client.patina.cloud",
  );
  assertStringIncludes(html, "Living Room Refresh");
  assertStringIncludes(html, "Pick a sofa fabric");
  assertStringIncludes(html, "https://x/p/1");
  // category headings present
  assertStringIncludes(html.toLowerCase(), "proposal");
  assertStringIncludes(html.toLowerCase(), "decision");
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
      category: "decision",
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
    category: "decision",
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
