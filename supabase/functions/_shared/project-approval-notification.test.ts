import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  resolveApprovalArtifactCitation,
  resolveFrozenLeadRecipient,
} from "./project-approval-notification.ts";

const CHECKSUM = "a".repeat(64);

Deno.test("Stage-2 evidence resolves the immutable artifact citation", () => {
  assertEquals(
    resolveApprovalArtifactCitation({
      source_kind: "plan_issue",
      source_version: 7,
      artifact_hash: CHECKSUM,
      artifact_title: "Issued construction set",
    }),
    {
      kind: "plan_issue",
      version: 7,
      checksum: CHECKSUM,
      title: "Issued construction set",
    },
  );
});

Deno.test("Stage-2 artifact evidence fails closed when incomplete", () => {
  assertEquals(
    resolveApprovalArtifactCitation({
      source_kind: "plan_issue",
      source_version: 7,
      artifact_hash: "not-a-checksum",
      artifact_title: "Issued construction set",
    }),
    null,
  );
});

Deno.test("frozen lead wins over any mutable relationship recipient", () => {
  assertEquals(
    resolveFrozenLeadRecipient({
      decision_lead_id: "frozen-lead",
      decision_lead: {
        id: "frozen-lead",
        full_name: "Frozen Lead",
        email: "lead@example.test",
      },
    }),
    {
      userId: "frozen-lead",
      name: "Frozen Lead",
      email: "lead@example.test",
    },
  );
});

Deno.test("frozen lead evidence fails closed on profile mismatch", () => {
  assertEquals(
    resolveFrozenLeadRecipient({
      decision_lead_id: "frozen-lead",
      decision_lead: {
        id: "other-client",
        full_name: "Other Client",
        email: "other@example.test",
      },
    }),
    null,
  );
});
