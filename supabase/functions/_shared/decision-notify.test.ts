import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type ApprovalArtifactCitation,
  classifyExistingDecisionEmailLogStatuses,
  type DecisionContext,
  decisionLogKey,
  decisionMailHold,
  decisionNotificationMetadata,
  decisionReleaseSentence,
  formatCostDelta,
  localWeekdayAndHour,
  normalizeReminderCadence,
  receiptOutcomeWord,
  renderDecisionEmail,
  renderDecisionReceiptEmail,
  supersededDeltaLines,
  supersededOpeningLine,
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
  const rendered = renderDecisionEmail(
    "decision_resolved",
    "Recipient",
    STAGE2,
  );
  assertStringIncludes(rendered.html, "plan_issue");
  assertStringIncludes(rendered.html, "version 4");
  assertStringIncludes(rendered.html, CHECKSUM);
  assertStringIncludes(rendered.html, "Client &lt;issued&gt; set");
  assert(!rendered.html.includes("Client <issued> set"));
});

for (const kind of ["decision_required", "decision_overdue"] as const) {
  Deno.test(`${kind} cites the edition, not the checksum (R6)`, () => {
    const rendered = renderDecisionEmail(kind, "Anne", STAGE2, STUDIO);
    assertStringIncludes(
      rendered.html,
      "Edition 4 &middot; issued September 28",
    );
    assert(!rendered.html.includes(CHECKSUM), "the hash stays in the record");
    assert(!rendered.html.includes("SHA-256"));
    assert(
      !rendered.html.includes("plan_issue"),
      "the enum spelling is not her word",
    );
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
      'Or open it directly: <a href="https://client.patina.cloud/decisions/decision-1"',
    );
    assertStringIncludes(rendered.html, "Review the plan set");
    assert(!rendered.html.includes("Open your Patina dashboard"));
  });

  Deno.test(`${kind} is signed by the studio, never by Patina (R7)`, () => {
    const rendered = renderDecisionEmail(kind, "Anne", STAGE2, STUDIO);
    assertStringIncludes(
      rendered.html,
      "&mdash; Leah, Middle West Studio<br>Madison",
    );
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
    assertStringIncludes(
      rendered.html,
      'href="https://client.patina.cloud/preferences"',
    );
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
    'Leah sent "Client <issued> set" for your approval',
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
    'Middle West Studio sent "Client <issued> set" for your approval',
  );
});

Deno.test("a first notice falls back to a plain asker with no identity at all", () => {
  const rendered = renderDecisionEmail("decision_required", "Anne", FIRST, {});
  assertEquals(
    rendered.subject,
    'Your designer sent "Client <issued> set" for your approval',
  );
});

Deno.test("a reminder is subject-lined by the day it is due (P-02)", () => {
  const rendered = renderDecisionEmail(
    "decision_required",
    "Anne",
    { ...STAGE2, notice: "reminder" },
    STUDIO,
  );
  assertEquals(rendered.subject, 'Thursday: "Client <issued> set"');
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
  assertEquals(rendered.subject, 'Thursday: "Client <issued> set"');
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
  assertEquals(rendered.subject, 'Still waiting: "Client <issued> set"');
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
    'Thursday: "Client <issued> set"',
  );
  assertEquals(
    renderDecisionEmail("decision_required", "Anne", decision, STUDIO, {
      timeZone: "UTC",
    }).subject,
    'Friday: "Client <issued> set"',
  );
});

Deno.test("the overdue notice is quiet: no 'overdue', no guilt (P-04)", () => {
  const rendered = renderDecisionEmail(
    "decision_overdue",
    "Anne",
    STAGE2,
    STUDIO,
  );
  assertEquals(rendered.subject, 'Still open: "Client <issued> set"');
  assertStringIncludes(
    rendered.html,
    "Still open, Leah asked on September 28.",
  );
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
  assertStringIncludes(rendered.html, "Review the decision");
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
  assertEquals(
    first.subject,
    'Leah sent "Client <issued> set" for your approval',
  );
  assert(!first.html.includes("Nothing has changed since it was sent"));

  const reminder = renderDecisionEmail(
    "decision_required",
    "Dana",
    { ...STAGE2, notice: "reminder" },
    STUDIO,
  );
  assertEquals(reminder.subject, 'Thursday: "Client <issued> set"');
  assertStringIncludes(reminder.html, "Nothing has changed since it was sent");
});

// ── Carried copy defects from the lane's first two review rounds ────────────

Deno.test("an unmapped artifact kind never renders the word 'undefined' (F4)", () => {
  const odd: DecisionContext = {
    ...STAGE2,
    notice: "first",
    artifact: {
      ...STAGE2.artifact!,
      // ux/03 §9 ruling 5 contemplates project documents becoming approvable;
      // the CHECK pins three kinds today, so this is the shape of tomorrow.
      kind: "project_document" as ApprovalArtifactCitation["kind"],
    },
  };
  const rendered = renderDecisionEmail(
    "decision_required",
    "Anne",
    odd,
    STUDIO,
  );
  assert(!rendered.html.includes("undefined"));
  assert(!rendered.subject.includes("undefined"));
  assertStringIncludes(rendered.html, "is ready for your answer.");
  // Still an approval — the button says so rather than naming a kind nobody
  // wrote a word for.
  assertStringIncludes(rendered.html, "Review the approval");
});

Deno.test("every letter quotes the stored title, subject and body alike (F5)", () => {
  const lowercase: DecisionContext = {
    ...STAGE2,
    artifact: { ...STAGE2.artifact!, title: "approve the issued set" },
  };
  const first = renderDecisionEmail("decision_required", "Anne", {
    ...lowercase,
    notice: "first",
  }, STUDIO);
  assertEquals(
    first.subject,
    'Leah sent "approve the issued set" for your approval',
  );
  assertStringIncludes(first.html, '"<strong');
  assertStringIncludes(first.html, 'approve the issued set</strong>"');

  const reminder = renderDecisionEmail("decision_required", "Anne", {
    ...lowercase,
    notice: "reminder",
  }, STUDIO);
  assertEquals(reminder.subject, 'Thursday: "approve the issued set"');
  assertStringIncludes(reminder.html, 'approve the issued set</strong>"');

  const overdue = renderDecisionEmail(
    "decision_overdue",
    "Anne",
    lowercase,
    STUDIO,
  );
  assertEquals(overdue.subject, 'Still open: "approve the issued set"');
  assertStringIncludes(overdue.html, 'approve the issued set</strong>"');
});

Deno.test("the unnamed designer is lowercase mid-sentence, capitalised at its head (F6)", () => {
  const overdue = renderDecisionEmail("decision_overdue", "Anne", STAGE2, {});
  assertStringIncludes(
    overdue.html,
    "Still open, your designer asked on September 28.",
  );
  assert(!overdue.html.includes("Still open, Your designer"));

  // A real name keeps its capitals wherever it falls.
  const named = renderDecisionEmail("decision_overdue", "Anne", STAGE2, STUDIO);
  assertStringIncludes(named.html, "Still open, Leah asked on September 28.");

  // Sentence-initial, the fallback keeps its capital.
  const first = renderDecisionEmail("decision_required", "Anne", {
    ...STAGE2,
    notice: "first",
  }, {});
  assert(first.subject.startsWith("Your designer sent "));
});

Deno.test("an option choice is a decision; only a frozen edition is an approval (F7)", () => {
  const legacy: DecisionContext = {
    id: "legacy-3",
    title: "Rug color — Natural vs Sand",
    dueDate: null,
    notice: "first",
  };
  const rendered = renderDecisionEmail(
    "decision_required",
    "Anne",
    legacy,
    STUDIO,
  );
  assertEquals(
    rendered.subject,
    'Leah sent "Rug color — Natural vs Sand" for your decision',
  );
  assertStringIncludes(rendered.html, "Review the decision");
  assertStringIncludes(rendered.html, ">Decision</td>");
  assert(!rendered.html.includes("Review the approval"));

  // A Stage-2 row keeps the word the ask actually is.
  const stage2 = renderDecisionEmail("decision_required", "Anne", {
    ...STAGE2,
    notice: "first",
  }, STUDIO);
  assertStringIncludes(stage2.subject, "for your approval");
  assertStringIncludes(stage2.html, ">Approval</td>");
});

Deno.test("'nothing has changed' is claimed only of an edition that has not (F8)", () => {
  // The edition she was sent is the edition in front of her.
  const unchanged = renderDecisionEmail("decision_required", "Anne", {
    ...STAGE2,
    notice: "reminder",
  }, STUDIO);
  assertStringIncludes(
    unchanged.html,
    "Nothing has changed since it was sent.",
  );

  // A newer edition landed after the ask went out — the letter says nothing.
  const reissued = renderDecisionEmail("decision_required", "Anne", {
    ...STAGE2,
    notice: "reminder",
    artifact: { ...STAGE2.artifact!, issuedAt: "2026-10-01T14:00:00Z" },
  }, STUDIO);
  assert(!reissued.html.includes("Nothing has changed"));

  // A legacy option choice — the row extend_and_reopen moves the date on and
  // wipes the answer from — carries no edition and claims nothing.
  const legacy = renderDecisionEmail("decision_required", "Anne", {
    id: "legacy-4",
    title: "Choose a finish",
    dueDate: "2026-10-08T18:00:00Z",
    sentAt: "2026-09-28T14:00:00Z",
    notice: "reminder",
  }, STUDIO);
  assert(!legacy.html.includes("Nothing has changed"));
});

Deno.test("one subject rule across the three letters: quoted title, no trailing period (F11)", () => {
  const subjects = [
    renderDecisionEmail("decision_required", "Anne", {
      ...STAGE2,
      notice: "first",
    }, STUDIO).subject,
    renderDecisionEmail("decision_required", "Anne", {
      ...STAGE2,
      notice: "reminder",
    }, STUDIO).subject,
    renderDecisionEmail("decision_overdue", "Anne", STAGE2, STUDIO).subject,
    renderDecisionEmail("decision_required", "Anne", {
      ...STAGE2,
      dueDate: null,
      notice: "reminder",
    }, STUDIO).subject,
  ];
  for (const subject of subjects) {
    assert(!subject.endsWith("."), `trailing period on: ${subject}`);
    assertStringIncludes(subject, '"Client <issued> set"');
  }
});

Deno.test("the client letters carry no Patina tagline under the studio's name (F9)", () => {
  for (
    const decision of [
      { ...STAGE2, notice: "first" as const },
      { ...STAGE2, notice: "reminder" as const },
    ]
  ) {
    const rendered = renderDecisionEmail(
      "decision_required",
      "Anne",
      decision,
      STUDIO,
    );
    assert(
      !rendered.html.includes("A workshop for interior designers"),
      "the studio signs this letter; Patina does not pitch under the signature",
    );
  }
  const overdue = renderDecisionEmail(
    "decision_overdue",
    "Anne",
    STAGE2,
    STUDIO,
  );
  assert(!overdue.html.includes("A workshop for interior designers"));

  // The designer's own letter is untouched.
  const resolved = renderDecisionEmail("decision_resolved", "Leah", STAGE2);
  assertStringIncludes(resolved.html, "A workshop for interior designers");
});

// ── P-13. The designer's one-line why ──────────────────────────────────────

const WHY = "The island moved a foot; everything else is as we drew it.";
const WITH_WHY: DecisionContext = {
  ...STAGE2,
  artifact: { ...STAGE2.artifact!, why: WHY },
};

Deno.test("the why rides the first notice, the reminder and the overdue letter (P-13)", () => {
  const letters = [
    renderDecisionEmail("decision_required", "Anne", {
      ...WITH_WHY,
      notice: "first",
    }, STUDIO),
    renderDecisionEmail("decision_required", "Anne", {
      ...WITH_WHY,
      notice: "reminder",
    }, STUDIO),
    renderDecisionEmail("decision_overdue", "Anne", WITH_WHY, STUDIO),
  ];
  for (const letter of letters) {
    assertStringIncludes(letter.html, WHY);
    // The note's own attribution, not the studio signature at the foot: the
    // sign-off reads "— Leah, Middle West Studio" and would match a looser pin.
    assertStringIncludes(letter.html, ">&mdash; Leah</p>");
  }
});

Deno.test("the why is attributed to a person, or to nobody — never to 'Your designer'", () => {
  const studioOnly = renderDecisionEmail("decision_required", "Anne", {
    ...WITH_WHY,
    notice: "first",
  }, { studioName: "Middle West Studio" });
  assertStringIncludes(studioOnly.html, ">&mdash; Middle West Studio</p>");

  const anonymous = renderDecisionEmail("decision_required", "Anne", {
    ...WITH_WHY,
    notice: "first",
  }, {});
  assertStringIncludes(anonymous.html, WHY);
  assert(
    !anonymous.html.includes("&mdash;"),
    "an unattributed note is signed by nobody, not by a placeholder",
  );
});

Deno.test("the frozen author signs the note, not the project's designer of record", () => {
  // Any studio co-member may compose an ask, and a designer may be renamed
  // between the first notice and the overdue letter. The cobrand signature is
  // resolved live from the project's designer_id, so on both counts it can name
  // someone who did not write the sentence — while the projection renders the
  // frozen name. One line, one author, every surface.
  const byPeer: DecisionContext = {
    ...STAGE2,
    artifact: { ...STAGE2.artifact!, why: WHY, whyAuthorName: "Peer" },
  };
  for (
    const letter of [
      renderDecisionEmail("decision_required", "Anne", {
        ...byPeer,
        notice: "first",
      }, STUDIO),
      renderDecisionEmail("decision_required", "Anne", {
        ...byPeer,
        notice: "reminder",
      }, STUDIO),
      renderDecisionEmail("decision_overdue", "Anne", byPeer, STUDIO),
    ]
  ) {
    assertStringIncludes(letter.html, ">&mdash; Peer</p>");
    assert(
      !letter.html.includes(">&mdash; Leah</p>"),
      "the note is signed by its author, never by the project's designer",
    );
  }
  // The sign-off at the foot is the STUDIO's, and it still speaks for the
  // studio — only the quoted line changes hands.
  assertStringIncludes(
    renderDecisionEmail("decision_overdue", "Anne", byPeer, STUDIO).html,
    "Leah",
  );
});

Deno.test("a frozen author that resolved to nothing falls back, and is escaped", () => {
  const blank = renderDecisionEmail("decision_required", "Anne", {
    ...STAGE2,
    notice: "first",
    artifact: { ...STAGE2.artifact!, why: WHY, whyAuthorName: "   " },
  }, STUDIO);
  assertStringIncludes(blank.html, ">&mdash; Leah</p>");

  const injected = renderDecisionEmail("decision_required", "Anne", {
    ...STAGE2,
    notice: "first",
    artifact: { ...STAGE2.artifact!, why: WHY, whyAuthorName: "<b>Peer</b>" },
  }, STUDIO);
  assertStringIncludes(injected.html, "&lt;b&gt;Peer&lt;/b&gt;");
  assert(!injected.html.includes("<b>Peer</b>"));
});

Deno.test("an approval with no why carries no note and no dangling attribution", () => {
  for (
    const decision of [
      { ...STAGE2, notice: "first" as const },
      { ...STAGE2, notice: "reminder" as const },
    ]
  ) {
    const rendered = renderDecisionEmail(
      "decision_required",
      "Anne",
      decision,
      STUDIO,
    );
    assert(!rendered.html.includes(">&mdash; Leah</p>"));
    assert(!rendered.html.includes("&ldquo;"), "no empty quotation is drawn");
  }
  const overdue = renderDecisionEmail(
    "decision_overdue",
    "Anne",
    STAGE2,
    STUDIO,
  );
  assert(!overdue.html.includes(">&mdash; Leah</p>"));
  assert(!overdue.html.includes("&ldquo;"));
});

Deno.test("the why is escaped, never injected", () => {
  const rendered = renderDecisionEmail("decision_required", "Anne", {
    ...STAGE2,
    notice: "first",
    artifact: { ...STAGE2.artifact!, why: "<b>not</b> markup" },
  }, STUDIO);
  assertStringIncludes(rendered.html, "&lt;b&gt;not&lt;/b&gt; markup");
  assert(!rendered.html.includes("<b>not</b> markup"));
});

// ── P-20. The approval receipt ─────────────────────────────────────────────

const RECEIPT_BASE = {
  ...STAGE2,
  outcome: "approved",
};

Deno.test("changes_requested is RETURNED, never Declined (P-16 vocabulary)", () => {
  assertEquals(receiptOutcomeWord("approved"), "approved");
  assertEquals(receiptOutcomeWord("changes_requested"), "returned");
  assertEquals(receiptOutcomeWord("needs_discussion"), "held");
  assertEquals(receiptOutcomeWord("declined"), null);
  assertEquals(receiptOutcomeWord(null), null);
});

Deno.test("the receipt names what the answer released (R9)", () => {
  const rendered = renderDecisionReceiptEmail("Anne", {
    ...RECEIPT_BASE,
    releasedItems: ["the cabinet order"],
  }, STUDIO);
  assertEquals(rendered.subject, 'You approved "Client <issued> set".');
  assertStringIncludes(rendered.html, "It releases the cabinet order.");
  assertStringIncludes(
    rendered.html,
    "https://client.patina.cloud/decisions/decision-1",
  );
  assert(!rendered.html.includes("Approve"), "the act is never re-offered");
  assert(!rendered.html.includes("Sign"));
});

Deno.test("the receipt claims no consequence when there is none (R9)", () => {
  for (
    const decision of [
      { ...RECEIPT_BASE, releasedItems: [] },
      { ...RECEIPT_BASE, outcome: "changes_requested", releasedItems: [] },
      { ...RECEIPT_BASE, outcome: "needs_discussion" },
    ]
  ) {
    const rendered = renderDecisionReceiptEmail("Anne", decision, STUDIO);
    assertStringIncludes(rendered.html, "Your answer is on the record.");
    assert(!rendered.html.includes("It releases"));
  }
  assertEquals(
    renderDecisionReceiptEmail("Anne", {
      ...RECEIPT_BASE,
      outcome: "changes_requested",
    }, STUDIO).subject,
    'You returned "Client <issued> set".',
  );
  assertEquals(
    renderDecisionReceiptEmail("Anne", {
      ...RECEIPT_BASE,
      outcome: "needs_discussion",
    }, STUDIO).subject,
    'You held "Client <issued> set".',
  );
});

Deno.test("the release sentence names a lone piece and counts every other case in words", () => {
  assertEquals(decisionReleaseSentence([]), "Your answer is on the record.");
  assertEquals(
    decisionReleaseSentence(["the cabinet order"]),
    "It releases the cabinet order.",
  );
  assertEquals(
    decisionReleaseSentence(["the cabinet order", "the island stone"]),
    "It releases two pieces that were waiting on it.",
  );
  assertEquals(
    decisionReleaseSentence(["a", "b", "c"]),
    "It releases three pieces that were waiting on it.",
  );
  assertEquals(
    decisionReleaseSentence(Array.from({ length: 20 }, (_, i) => `p${i}`)),
    "It releases twenty pieces that were waiting on it.",
  );
  assertEquals(
    decisionReleaseSentence(Array.from({ length: 21 }, (_, i) => `p${i}`)),
    "It releases the pieces that were waiting on it.",
  );
  // Blank names are not pieces.
  assertEquals(
    decisionReleaseSentence(["  ", ""]),
    "Your answer is on the record.",
  );
});

Deno.test("a catalogue name with a comma is counted, never read as a list", () => {
  // project_ffe_items.name is text the studio typed. "Built-in shelving, north
  // wall" named alongside a second piece read as three things.
  assertEquals(
    decisionReleaseSentence(["Built-in shelving, north wall"]),
    "It releases one piece that was waiting on it.",
  );
  assertEquals(
    decisionReleaseSentence([
      "Built-in shelving, north wall",
      "Built-in Window Banquette",
    ]),
    "It releases two pieces that were waiting on it.",
  );
  // The comma has to be in the surviving name, not in a blank the filter drops.
  assertEquals(
    decisionReleaseSentence(["  ", "the cabinet order"]),
    "It releases the cabinet order.",
  );
});

Deno.test("the receipt is signed by the studio and escapes the title", () => {
  const rendered = renderDecisionReceiptEmail("Anne", RECEIPT_BASE, STUDIO);
  assertStringIncludes(rendered.html, "Leah");
  assertStringIncludes(rendered.html, "Middle West Studio");
  assertStringIncludes(rendered.html, "Client &lt;issued&gt; set");
  assert(
    !rendered.html.includes(
      '<strong style="color:#1F1B16; font-weight:600;">Client <issued>',
    ),
  );
  assert(
    !rendered.html.includes("A workshop for interior designers"),
    "the studio signs the homeowner's receipt; Patina does not pitch under it",
  );
});

// ── P-28 · R16. When Patina writes, and when it does not ───────────────────

const GATE_BASE = {
  kind: "decision_required" as const,
  notice: "reminder" as const,
  isSupersedingEdition: false,
  cadence: "right_away" as const,
  timeZone: "America/New_York",
  // Wednesday 2026-10-07, 10:00 in New York.
  now: new Date("2026-10-07T14:00:00Z"),
  snoozedUntil: null as string | null,
  overdueAlreadySent: false,
};

Deno.test("the retired cadence spellings normalise, and an unknown one is quiet", () => {
  assertEquals(normalizeReminderCadence("immediate"), "right_away");
  assertEquals(normalizeReminderCadence("daily_digest"), "daily");
  assertEquals(normalizeReminderCadence("right_away"), "right_away");
  assertEquals(normalizeReminderCadence("weekly_sunday"), "weekly_sunday");
  // The column default, and the quietest cadence that still answers on time.
  assertEquals(normalizeReminderCadence(null), "daily");
  assertEquals(normalizeReminderCadence("whatever"), "daily");
});

Deno.test("an ordinary reminder goes out on a weekday morning", () => {
  assertEquals(decisionMailHold(GATE_BASE), null);
});

Deno.test("a batching cadence folds the in-between reminder into the digest", () => {
  assertEquals(
    decisionMailHold({ ...GATE_BASE, cadence: "daily" }),
    "cadence_digest",
  );
  assertEquals(
    decisionMailHold({ ...GATE_BASE, cadence: "weekly_sunday" }),
    "cadence_digest",
  );
});

Deno.test("the first notice breaks every digest — news is not summary", () => {
  for (const cadence of ["daily", "weekly_sunday"] as const) {
    assertEquals(
      decisionMailHold({ ...GATE_BASE, notice: "first", cadence }),
      null,
    );
  }
});

Deno.test("a snooze silences the reminder until its hour, then stops", () => {
  assertEquals(
    decisionMailHold({
      ...GATE_BASE,
      snoozedUntil: "2026-10-09T12:00:00Z",
    }),
    "snoozed",
  );
  assertEquals(
    decisionMailHold({
      ...GATE_BASE,
      snoozedUntil: "2026-10-06T12:00:00Z",
    }),
    null,
  );
  // 'never' arrives as Postgres 'infinity'.
  assertEquals(
    decisionMailHold({ ...GATE_BASE, snoozedUntil: "infinity" }),
    "snoozed",
  );
});

Deno.test("a snooze never suppresses the overdue notice or a superseding edition (R16)", () => {
  assertEquals(
    decisionMailHold({
      ...GATE_BASE,
      kind: "decision_overdue",
      snoozedUntil: "infinity",
      cadence: "weekly_sunday",
    }),
    null,
  );
  assertEquals(
    decisionMailHold({
      ...GATE_BASE,
      notice: "first",
      isSupersedingEdition: true,
      snoozedUntil: "infinity",
      cadence: "weekly_sunday",
    }),
    null,
  );
});

Deno.test("after the overdue notice Patina goes quiet about that approval", () => {
  for (const notice of ["first", "reminder"] as const) {
    assertEquals(
      decisionMailHold({ ...GATE_BASE, notice, overdueAlreadySent: true }),
      "quiet_after_overdue",
    );
  }
  // The overdue letter itself is what created the state; it is not gated by it.
  assertEquals(
    decisionMailHold({
      ...GATE_BASE,
      kind: "decision_overdue",
      overdueAlreadySent: true,
    }),
    null,
  );
});

Deno.test("no automated approval mail on Sunday, and none before 8am local", () => {
  // Sunday 2026-10-11, 10:00 in New York.
  assertEquals(
    decisionMailHold({
      ...GATE_BASE,
      now: new Date("2026-10-11T14:00:00Z"),
    }),
    "sunday_quiet",
  );
  // Monday 2026-10-12, 05:00 in New York — the hour the daily cron used to run.
  assertEquals(
    decisionMailHold({
      ...GATE_BASE,
      now: new Date("2026-10-12T09:00:00Z"),
    }),
    "before_local_morning",
  );
  // Monday 2026-10-12, 08:00 in New York — released.
  assertEquals(
    decisionMailHold({
      ...GATE_BASE,
      now: new Date("2026-10-12T12:00:00Z"),
    }),
    null,
  );
});

Deno.test("the Sunday rule is read in HER zone, not the cron's", () => {
  // 2026-10-12T02:00Z is Monday in UTC and Sunday evening in Los Angeles.
  assertEquals(
    decisionMailHold({
      ...GATE_BASE,
      timeZone: "America/Los_Angeles",
      now: new Date("2026-10-12T02:00:00Z"),
    }),
    "sunday_quiet",
  );
  assertEquals(
    decisionMailHold({
      ...GATE_BASE,
      timeZone: "UTC",
      now: new Date("2026-10-12T02:00:00Z"),
    }),
    "before_local_morning",
  );
});

Deno.test("the designer's resolved letter answers to none of this", () => {
  assertEquals(
    decisionMailHold({
      ...GATE_BASE,
      kind: "decision_resolved",
      cadence: "weekly_sunday",
      snoozedUntil: "infinity",
      overdueAlreadySent: true,
      now: new Date("2026-10-11T05:00:00Z"),
    }),
    null,
  );
});

Deno.test("localWeekdayAndHour reads midnight as hour zero", () => {
  assertEquals(
    localWeekdayAndHour(new Date("2026-10-12T04:00:00Z"), "America/New_York"),
    { weekday: 1, hour: 0 },
  );
});

// ── P-27. The successor read as one thread ─────────────────────────────────

const SUCCESSOR: DecisionContext = {
  ...STAGE2,
  id: "decision-4",
  artifact: {
    kind: "plan_issue",
    version: 4,
    checksum: CHECKSUM,
    title: "Kitchen plan set",
    issuedAt: "2026-09-28T14:00:00Z",
  },
  notice: "first",
  supersedes: {
    version: 3,
    title: "Kitchen plan set",
    answeredOn: "2026-09-02T15:00:00Z",
    answeredOutcome: "approved",
    costCentsDelta: 124_000,
    scheduleDaysDelta: 0,
    leadTimeDaysDelta: -6,
  },
};

Deno.test("the successor names her own answer and never undoes it", () => {
  const rendered = renderDecisionEmail("decision_required", "Anne", SUCCESSOR, STUDIO);
  assertStringIncludes(
    rendered.html,
    "Edition 4 replaces the edition you approved on September 2.",
  );
  assertStringIncludes(rendered.html, "Edition 3 stays in the record.");
  for (const undoing of ["undo", "no longer", "cancel", "reopen", "invalid"]) {
    assert(
      !rendered.html.toLowerCase().includes(undoing),
      `the letter must not imply the old answer was undone (${undoing})`,
    );
  }
});

Deno.test("the successor states the three deltas independently (R11)", () => {
  const rendered = renderDecisionEmail("decision_required", "Anne", SUCCESSOR, STUDIO);
  assertStringIncludes(rendered.html, "Cost: +$1,240 against edition 3.");
  assertStringIncludes(rendered.html, "Schedule: unchanged from edition 3.");
  assertStringIncludes(rendered.html, "Lead time: 6 days shorter than edition 3.");
});

Deno.test("the successor carries one forward act, on the approval's own address", () => {
  const rendered = renderDecisionEmail("decision_required", "Anne", SUCCESSOR, STUDIO);
  const doors = rendered.html.match(
    /https:\/\/client\.patina\.cloud\/decisions\/decision-4/g,
  ) ?? [];
  assert(doors.length >= 1, "the successor's own door is in the letter");
  assert(
    !rendered.html.includes("/decisions/decision-3"),
    "one forward act — never a second link back to the edition she answered",
  );
});

Deno.test("with no computable delta the successor still opens on the thread", () => {
  const rendered = renderDecisionEmail(
    "decision_required",
    "Anne",
    {
      ...SUCCESSOR,
      supersedes: { version: 3, answeredOn: null, answeredOutcome: null },
    },
    STUDIO,
  );
  assertStringIncludes(rendered.html, "Edition 4 replaces edition 3.");
  assertStringIncludes(rendered.html, "Edition 3 stays in the record.");
  assert(
    !rendered.html.includes("What changed:"),
    "no delta section when there is no delta to state",
  );
});

Deno.test("a first notice with no predecessor is unchanged", () => {
  const rendered = renderDecisionEmail(
    "decision_required",
    "Anne",
    { ...SUCCESSOR, supersedes: null },
    STUDIO,
  );
  assertStringIncludes(rendered.html, "is ready, exactly as drawn.");
  assert(!rendered.html.includes("replaces"));
});

Deno.test("a superseding edition is logged as one without changing the dedupe key", () => {
  const metadata = decisionNotificationMetadata("decision_required", SUCCESSOR);
  assertEquals(metadata.supersedesVersion, 3);
  assertEquals(decisionLogKey("decision_required", SUCCESSOR), {
    decisionId: "decision-4",
    notice: "first",
  });
});

Deno.test("a cost delta is signed, and zero is stated as unchanged", () => {
  assertEquals(formatCostDelta(0), "$0");
  assertEquals(formatCostDelta(124_000), "+$1,240");
  assertEquals(formatCostDelta(-45_050), "−$450.50");
  assertEquals(
    supersededDeltaLines({ version: 2, costCentsDelta: 0 }),
    ["Cost: unchanged from edition 2."],
  );
  assertEquals(supersededDeltaLines({ version: 2 }), []);
});

Deno.test("an unanswered predecessor is named by number, never by an answer", () => {
  assertEquals(
    supersededOpeningLine(4, { version: 3 }, "America/New_York"),
    "Edition 4 replaces edition 3.",
  );
  assertEquals(
    supersededOpeningLine(
      4,
      { version: 3, answeredOn: "2026-09-02T15:00:00Z", answeredOutcome: "returned" },
      "America/New_York",
    ),
    "Edition 4 replaces the edition you returned on September 2.",
  );
});
