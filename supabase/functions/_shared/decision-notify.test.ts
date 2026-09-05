import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  classifyExistingDecisionEmailLogStatuses,
  type DecisionContext,
  decisionLogKey,
  decisionNotificationMetadata,
  renderDecisionEmail,
} from "./decision-notify.ts";

// The letters below assert the addresses a homeowner actually reads, so the
// portal origins are pinned rather than inherited from whatever the runner's
// environment happens to carry.
try {
  Deno.env.set("CLIENT_PORTAL_URL", "https://client.patina.cloud");
  Deno.env.set("DESIGNER_PORTAL_URL", "https://app.patina.cloud");
} catch {
  // No --allow-env: the module's own fallbacks are these same origins.
}

const CHECKSUM = "b".repeat(64);
const STAGE2: DecisionContext = {
  id: "decision-1",
  title: "Approve the issued set",
  // Thursday 2026-10-08 in America/New_York.
  dueDate: "2026-10-08T18:00:00Z",
  sentAt: "2026-09-28T14:00:00Z",
  artifact: {
    kind: "plan_issue",
    version: 4,
    checksum: CHECKSUM,
    title: "Client <issued> set",
    issuedAt: "2026-09-28T14:00:00Z",
  },
};

const STUDIO = {
  designerGivenName: "Leah",
  studioName: "Middle West Studio",
  city: "Madison",
};

Deno.test("the designer's resolved notice keeps the immutable evidence", () => {
  const rendered = renderDecisionEmail("decision_resolved", "Recipient", STAGE2);
  assertStringIncludes(rendered.html, "plan_issue");
  assertStringIncludes(rendered.html, "version 4");
  assertStringIncludes(rendered.html, CHECKSUM);
  assertStringIncludes(rendered.html, "Client &lt;issued&gt; set");
  assert(!rendered.html.includes("Client <issued> set"));
});

for (const kind of ["decision_required", "decision_overdue"] as const) {
  Deno.test(`${kind} cites the edition, not the checksum (R6)`, () => {
    const rendered = renderDecisionEmail(kind, "Anne", STAGE2, STUDIO);
    assertStringIncludes(rendered.html, "Edition 4 &middot; issued September 28");
    assert(!rendered.html.includes(CHECKSUM), "the hash stays in the record");
    assert(!rendered.html.includes("SHA-256"));
    assert(!rendered.html.includes("plan_issue"), "the enum spelling is not her word");
    assertStringIncludes(rendered.html, "Client &lt;issued&gt; set");
    assert(!rendered.html.includes("Client <issued> set"));
  });

  Deno.test(`${kind} carries a real door and its plaintext address (P-01)`, () => {
    const rendered = renderDecisionEmail(kind, "Anne", STAGE2, STUDIO);
    assertStringIncludes(
      rendered.html,
      'href="https://client.patina.cloud/decisions/decision-1"',
    );
    assertStringIncludes(
      rendered.html,
      "Or open it directly: <a href=\"https://client.patina.cloud/decisions/decision-1\"",
    );
    assertStringIncludes(rendered.html, "Review the plan set");
    assert(!rendered.html.includes("Open your Patina dashboard"));
  });

  Deno.test(`${kind} is signed by the studio, never by Patina (R7)`, () => {
    const rendered = renderDecisionEmail(kind, "Anne", STAGE2, STUDIO);
    assertStringIncludes(rendered.html, "&mdash; Leah, Middle West Studio<br>Madison");
    assert(!rendered.html.includes("— Patina"));
  });

  Deno.test(`${kind} omits the city when it is unknown`, () => {
    const rendered = renderDecisionEmail(kind, "Anne", STAGE2, {
      designerGivenName: "Leah",
      studioName: "Middle West Studio",
    });
    assertStringIncludes(rendered.html, "&mdash; Leah, Middle West Studio</p>");
  });

  Deno.test(`${kind} goes unsigned rather than signed "Patina"`, () => {
    const rendered = renderDecisionEmail(kind, "Anne", STAGE2, {});
    assert(!rendered.html.includes("— Patina"));
    assert(!rendered.html.includes("&mdash; "));
  });

  Deno.test(`${kind} addresses the client portal in its footer (P-03b)`, () => {
    const rendered = renderDecisionEmail(kind, "Anne", STAGE2, STUDIO);
    assertStringIncludes(rendered.html, 'href="https://client.patina.cloud/preferences"');
    assert(!rendered.html.includes("app.patina.cloud"));
    assert(!rendered.html.includes(">Dashboard</a>"));
  });
}

const FIRST: DecisionContext = { ...STAGE2, notice: "first" };

Deno.test("a first notice reads like one, not like a reminder (P-02)", () => {
  const rendered = renderDecisionEmail(
    "decision_required",
    "Anne",
    FIRST,
    STUDIO,
  );
  assertEquals(
    rendered.subject,
    "Leah sent Client <issued> set for your approval.",
  );
  assert(!rendered.subject.startsWith("Reminder:"));
  assertStringIncludes(rendered.html, "is ready, exactly as drawn.");
  assertStringIncludes(rendered.html, "Due Thursday, October 8.");
  assert(!rendered.html.includes("approximately"));
});

Deno.test("a first notice names the studio when no person is known", () => {
  const rendered = renderDecisionEmail("decision_required", "Anne", FIRST, {
    studioName: "Middle West Studio",
  });
  assertEquals(
    rendered.subject,
    "Middle West Studio sent Client <issued> set for your approval.",
  );
});

Deno.test("a first notice falls back to a plain asker with no identity at all", () => {
  const rendered = renderDecisionEmail("decision_required", "Anne", FIRST, {});
  assertEquals(
    rendered.subject,
    "Your designer sent Client <issued> set for your approval.",
  );
});

Deno.test("a reminder is subject-lined by the day it is due (P-02)", () => {
  const rendered = renderDecisionEmail(
    "decision_required",
    "Anne",
    { ...STAGE2, notice: "reminder" },
    STUDIO,
  );
  assertEquals(rendered.subject, "Thursday: Client <issued> set.");
  assertStringIncludes(rendered.html, "is still open and due Thursday.");
  assertStringIncludes(rendered.html, "Nothing has changed since it was sent.");
});

Deno.test("an undeclared decision_required letter speaks as a reminder (P-02)", () => {
  // The only live producer is the 48-hour cron, which returns to an approval
  // the studio sent days or weeks earlier. A letter that says "Leah sent this"
  // must never be the default.
  const rendered = renderDecisionEmail(
    "decision_required",
    "Anne",
    STAGE2,
    STUDIO,
  );
  assertEquals(rendered.subject, "Thursday: Client <issued> set.");
  assert(!rendered.subject.includes("sent"));
  assertStringIncludes(rendered.html, "Nothing has changed since it was sent.");
});

Deno.test("the first notice promises what the kind can keep (M3)", () => {
  const drawn = renderDecisionEmail("decision_required", "Anne", FIRST, STUDIO);
  assertStringIncludes(drawn.html, "is ready, exactly as drawn.");

  const priced = renderDecisionEmail("decision_required", "Anne", {
    ...FIRST,
    artifact: { ...FIRST.artifact!, kind: "budget_version" },
  }, STUDIO);
  assertStringIncludes(priced.html, "is ready, exactly as priced.");
  assert(!priced.html.includes("as drawn"));
  assertStringIncludes(priced.html, "Review the budget");

  const specified = renderDecisionEmail("decision_required", "Anne", {
    ...FIRST,
    artifact: { ...FIRST.artifact!, kind: "spec_book_artifact" },
  }, STUDIO);
  assertStringIncludes(specified.html, "is ready, exactly as specified.");
  assert(!specified.html.includes("as drawn"));

  // A legacy decision carries no edition at all — it claims nothing about one.
  const legacy = renderDecisionEmail("decision_required", "Anne", {
    id: "legacy-2",
    title: "Choose a finish",
    dueDate: null,
    notice: "first",
  }, STUDIO);
  assertStringIncludes(legacy.html, "is ready for your answer.");
  assert(!legacy.html.includes("as drawn"));
});

Deno.test("a reminder with no due date says so without inventing one", () => {
  const rendered = renderDecisionEmail(
    "decision_required",
    "Anne",
    { ...STAGE2, dueDate: null, notice: "reminder" },
    STUDIO,
  );
  assertEquals(rendered.subject, "Still waiting: Client <issued> set.");
  assert(!rendered.html.includes("due"));
});

Deno.test("the weekday is printed in the recipient's own zone", () => {
  // 2026-10-09T01:00Z is Friday in UTC and Thursday in New York.
  const decision: DecisionContext = {
    ...STAGE2,
    dueDate: "2026-10-09T01:00:00Z",
    notice: "reminder",
  };
  assertEquals(
    renderDecisionEmail("decision_required", "Anne", decision, STUDIO).subject,
    "Thursday: Client <issued> set.",
  );
  assertEquals(
    renderDecisionEmail("decision_required", "Anne", decision, STUDIO, {
      timeZone: "UTC",
    }).subject,
    "Friday: Client <issued> set.",
  );
});

Deno.test("the overdue notice is quiet: no 'overdue', no guilt (P-04)", () => {
  const rendered = renderDecisionEmail(
    "decision_overdue",
    "Anne",
    STAGE2,
    STUDIO,
  );
  assertEquals(rendered.subject, "Still open: Client <issued> set");
  assertStringIncludes(rendered.html, "Still open, Leah asked on September 28.");
  const lowered = rendered.html.toLowerCase();
  assert(!lowered.includes("overdue"));
  assert(!lowered.includes("passed its due date"));
  assert(!lowered.includes("still waiting on you"));
  assert(!lowered.includes("gentle"));
});

Deno.test("the overdue notice invents no ask date it does not have", () => {
  const rendered = renderDecisionEmail(
    "decision_overdue",
    "Anne",
    { ...STAGE2, sentAt: null },
    STUDIO,
  );
  assertStringIncludes(rendered.html, "Still open.</p>");
  assert(!rendered.html.includes("asked on"));
});

Deno.test("notification metadata carries traceability without reviewer IDs", () => {
  const metadata = decisionNotificationMetadata("decision_required", STAGE2);
  assertEquals(metadata, {
    decisionId: "decision-1",
    kind: "decision_required",
    notice: "reminder",
    artifactKind: "plan_issue",
    artifactVersion: 4,
    artifactChecksum: CHECKSUM,
    artifactTitle: "Client <issued> set",
  });
  const serialized = JSON.stringify(metadata).toLowerCase();
  assert(!serialized.includes("reviewer"));
  assert(!serialized.includes("leadid"));
  assert(!serialized.includes("approver"));
});

Deno.test("legacy notification rendering remains artifact-optional", () => {
  const rendered = renderDecisionEmail("decision_required", "Client", {
    id: "legacy-1",
    title: "Choose a finish",
    dueDate: null,
  }, STUDIO);
  assertStringIncludes(rendered.html, "Choose a finish");
  assert(!rendered.html.includes("SHA-256"));
  assert(!rendered.html.includes("Edition"));
  assertStringIncludes(rendered.html, "Review the approval");
  assertStringIncludes(
    rendered.html,
    'href="https://client.patina.cloud/decisions/legacy-1"',
  );
});

Deno.test("notification log status classification preserves delivery state", () => {
  assertEquals(
    classifyExistingDecisionEmailLogStatuses(["failed", "delivered"]),
    "delivered",
  );
  assertEquals(
    classifyExistingDecisionEmailLogStatuses(["queued", "sending"]),
    "sending",
  );
  assertEquals(
    classifyExistingDecisionEmailLogStatuses(["failed"]),
    null,
  );
  // 'sent' is the post-00552 accept state — a real prior send, not "no email".
  assertEquals(
    classifyExistingDecisionEmailLogStatuses(["sent"]),
    "sent",
  );
  assertEquals(
    classifyExistingDecisionEmailLogStatuses(["failed", "sent"]),
    "sent",
  );
  assertEquals(
    classifyExistingDecisionEmailLogStatuses(["sent", "delivered"]),
    "delivered",
  );
  assertEquals(
    classifyExistingDecisionEmailLogStatuses(["sending", "sent"]),
    "sent",
  );
  // 'complained' is terminal recipient-side evidence — never re-attempt.
  assertEquals(
    classifyExistingDecisionEmailLogStatuses(["complained"]),
    "complained",
  );
  assertEquals(
    classifyExistingDecisionEmailLogStatuses(["queued", "complained"]),
    "complained",
  );
});

// ── P-02: two letters, one kind ─────────────────────────────────────────────
// The first notice is produced at publish (decision-first-notice, trigger
// 00568); the reminder 48 hours before the due date (decision-reminders).
// Neither may deduplicate the other.

Deno.test("metadata records which register the letter spoke in", () => {
  assertEquals(
    decisionNotificationMetadata("decision_required", {
      ...STAGE2,
      notice: "first",
    }).notice,
    "first",
  );
  assertEquals(
    decisionNotificationMetadata("decision_required", {
      ...STAGE2,
      notice: "reminder",
    }).notice,
    "reminder",
  );
  // The other kinds are one letter each and carry no register.
  assertEquals(
    decisionNotificationMetadata("decision_overdue", STAGE2).notice,
    undefined,
  );
  assertEquals(
    decisionNotificationMetadata("decision_resolved", STAGE2).notice,
    undefined,
  );
});

Deno.test("the email dedupe key separates the first notice from the reminder", () => {
  assertEquals(
    decisionLogKey("decision_required", { ...STAGE2, notice: "first" }),
    { decisionId: "decision-1", notice: "first" },
  );
  assertEquals(
    decisionLogKey("decision_required", { ...STAGE2, notice: "reminder" }),
    { decisionId: "decision-1", notice: "reminder" },
  );
  // An undeclared register is the returning letter, matching the render default.
  assertEquals(
    decisionLogKey("decision_required", STAGE2),
    { decisionId: "decision-1", notice: "reminder" },
  );
});

Deno.test("overdue and resolved keep the one-letter dedupe key", () => {
  assertEquals(decisionLogKey("decision_overdue", STAGE2), {
    decisionId: "decision-1",
  });
  assertEquals(decisionLogKey("decision_resolved", STAGE2), {
    decisionId: "decision-1",
  });
});

Deno.test("the first notice announces the send, the reminder returns to it", () => {
  const first = renderDecisionEmail(
    "decision_required",
    "Dana",
    { ...STAGE2, notice: "first" },
    STUDIO,
  );
  assertEquals(first.subject, "Leah sent Client <issued> set for your approval.");
  assert(!first.html.includes("Nothing has changed since it was sent"));

  const reminder = renderDecisionEmail(
    "decision_required",
    "Dana",
    { ...STAGE2, notice: "reminder" },
    STUDIO,
  );
  assertEquals(reminder.subject, "Thursday: Client <issued> set.");
  assertStringIncludes(reminder.html, "Nothing has changed since it was sent");
});
