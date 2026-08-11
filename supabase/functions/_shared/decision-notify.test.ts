import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type DecisionContext,
  decisionNotificationMetadata,
  renderDecisionEmail,
} from "./decision-notify.ts";

const CHECKSUM = "b".repeat(64);
const STAGE2: DecisionContext = {
  id: "decision-1",
  title: "Approve the issued set",
  dueDate: "2026-08-12T18:00:00Z",
  artifact: {
    kind: "plan_issue",
    version: 4,
    checksum: CHECKSUM,
    title: "Client <issued> set",
  },
};

for (
  const kind of [
    "decision_required",
    "decision_overdue",
    "decision_resolved",
  ] as const
) {
  Deno.test(`${kind} cites immutable artifact evidence`, () => {
    const rendered = renderDecisionEmail(kind, "Recipient", STAGE2);
    assertStringIncludes(rendered.html, "plan_issue");
    assertStringIncludes(rendered.html, "version 4");
    assertStringIncludes(rendered.html, CHECKSUM);
    assertStringIncludes(rendered.html, "Client &lt;issued&gt; set");
    assert(!rendered.html.includes("Client <issued> set"));
  });
}

Deno.test("notification metadata carries traceability without reviewer IDs", () => {
  const metadata = decisionNotificationMetadata("decision_required", STAGE2);
  assertEquals(metadata, {
    decisionId: "decision-1",
    kind: "decision_required",
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
  });
  assertStringIncludes(rendered.html, "Choose a finish");
  assert(!rendered.html.includes("SHA-256"));
});
