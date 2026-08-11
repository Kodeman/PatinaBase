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

Deno.test("Stage-2 digest item cites immutable artifact and logs no reviewer IDs", () => {
  const checksum = "c".repeat(64);
  const items: ReminderDigestItem[] = [{
    category: "decision",
    title: "Approve the issue",
    link: "https://client.patina.cloud/decisions",
    decisionId: "decision-1",
    artifact: {
      kind: "spec_book_artifact",
      version: 6,
      checksum,
      title: "Client <specification> book",
    },
  }];
  const { html } = buildReminderDigestEmail(
    items,
    "https://client.patina.cloud",
  );
  assertStringIncludes(html, "spec_book_artifact");
  assertStringIncludes(html, "v6");
  assertStringIncludes(html, checksum);
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
