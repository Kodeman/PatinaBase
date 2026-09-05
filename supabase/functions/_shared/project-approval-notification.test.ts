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
      created_at: "2026-09-28T14:00:00Z",
    }),
    {
      kind: "plan_issue",
      version: 7,
      checksum: CHECKSUM,
      title: "Issued construction set",
      issuedAt: "2026-09-28T14:00:00Z",
      // P-13 (00569). An artifact composed without a why carries none, and
      // therefore carries no author either.
      why: null,
      whyAuthorName: null,
    },
  );
});

Deno.test("an edition with no issue stamp cites no date", () => {
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
      issuedAt: null,
      why: null,
      whyAuthorName: null,
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

Deno.test("the designer's one-line why rides the citation, blank-trimmed (P-13)", () => {
  assertEquals(
    resolveApprovalArtifactCitation({
      source_kind: "plan_issue",
      source_version: 7,
      artifact_hash: CHECKSUM,
      artifact_title: "Issued construction set",
      created_at: "2026-09-28T14:00:00Z",
      why: "The island moved a foot.",
    })?.why,
    "The island moved a foot.",
  );
  assertEquals(
    resolveApprovalArtifactCitation({
      source_kind: "plan_issue",
      source_version: 7,
      artifact_hash: CHECKSUM,
      artifact_title: "Issued construction set",
      why: "   ",
    })?.why,
    null,
  );
});

Deno.test("the why's author rides beside it, frozen, and never alone (P-13)", () => {
  const resolved = resolveApprovalArtifactCitation({
    source_kind: "plan_issue",
    source_version: 7,
    artifact_hash: CHECKSUM,
    artifact_title: "Issued construction set",
    why: "The island moved a foot.",
    why_author_name: "  Peer  ",
  });
  assertEquals(resolved?.whyAuthorName, "Peer");

  // A name under no line attributes nothing — 00569's CHECK says so, and the
  // resolver does not lean on it for rows written before that migration.
  assertEquals(
    resolveApprovalArtifactCitation({
      source_kind: "plan_issue",
      source_version: 7,
      artifact_hash: CHECKSUM,
      artifact_title: "Issued construction set",
      why: "   ",
      why_author_name: "Peer",
    })?.whyAuthorName,
    null,
  );
  assertEquals(
    resolveApprovalArtifactCitation({
      source_kind: "plan_issue",
      source_version: 7,
      artifact_hash: CHECKSUM,
      artifact_title: "Issued construction set",
      why: "The island moved a foot.",
      why_author_name: "   ",
    })?.whyAuthorName,
    null,
  );
});
