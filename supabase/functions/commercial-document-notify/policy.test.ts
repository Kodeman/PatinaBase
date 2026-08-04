import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  actorCanNotify,
  assessCommercialTransition,
  documentKindCanNotify,
  type CommercialTransitionEvidence,
  type CommercialTransitionPolicyInput,
} from "./policy.ts";

const evidence: CommercialTransitionEvidence = {
  clientSignature: true,
  studioSignature: true,
  projectDocument: {
    projectId: "project-1",
    documentKind: "design_services",
    executedAt: "2026-08-03T12:00:00Z",
    budgetCheckpointId: null,
    depositInvoiceId: null,
  },
  budgetCheckpoint: null,
  depositInvoice: null,
};

function assess(
  input: Partial<CommercialTransitionPolicyInput> &
    Pick<CommercialTransitionPolicyInput, "transition">,
) {
  return assessCommercialTransition({
    actorRole: "service",
    documentKind: "design_services",
    commercialState: "executed",
    eventId: null,
    evidence,
    ...input,
  });
}

Deno.test("transition actors are constrained by the act they committed", () => {
  assertEquals(actorCanNotify("studio", "executed"), true);
  assertEquals(actorCanNotify("studio", "client_signed"), false);
  assertEquals(actorCanNotify("client", "client_signed"), true);
  assertEquals(actorCanNotify("client", "budget_published"), false);
  assertEquals(actorCanNotify("service", "deposit_ready"), true);
  assertEquals(actorCanNotify("unknown", "furnishings_sent"), false);
});

Deno.test("document-kind matrix prevents cross-rail notification copy", () => {
  assertEquals(documentKindCanNotify("design_services", "executed"), true);
  assertEquals(
    documentKindCanNotify("service_addendum", "budget_published"),
    true,
  );
  assertEquals(
    documentKindCanNotify("furnishings_authorization", "executed"),
    false,
  );
  assertEquals(
    documentKindCanNotify("design_services", "furnishings_executed"),
    false,
  );
  assertEquals(documentKindCanNotify("legacy", "client_signed"), false);
});

Deno.test(
  "client-signed requires the exact pending-countersign posture",
  () => {
    assertEquals(
      assess({
        transition: "client_signed",
        actorRole: "client",
        commercialState: "client_signed",
      }),
      { allowed: true },
    );
    assertEquals(
      assess({
        transition: "client_signed",
        actorRole: "client",
        commercialState: "executed",
      }),
      { allowed: false, reason: "transition_not_committed" },
    );
  },
);

Deno.test(
  "executed services require both signatures and an executed project binding",
  () => {
    assertEquals(assess({ transition: "executed", actorRole: "studio" }), {
      allowed: true,
    });
    assertEquals(
      assess({
        transition: "executed",
        actorRole: "studio",
        evidence: { ...evidence, studioSignature: false },
      }),
      { allowed: false, reason: "transition_not_committed" },
    );
    assertEquals(
      assess({
        transition: "executed",
        actorRole: "studio",
        evidence: {
          ...evidence,
          projectDocument: { ...evidence.projectDocument!, executedAt: null },
        },
      }),
      { allowed: false, reason: "transition_not_committed" },
    );
  },
);

Deno.test(
  "budget publication is bound to its persisted event checkpoint",
  () => {
    const checkpoint = {
      id: "checkpoint-1",
      projectId: "project-1",
      status: "open",
      publishedAt: "2026-08-03T12:30:00Z",
      isCurrent: true,
    };
    assertEquals(
      assess({
        transition: "budget_published",
        actorRole: "studio",
        eventId: "checkpoint-1",
        evidence: { ...evidence, budgetCheckpoint: checkpoint },
      }),
      { allowed: true },
    );
    assertEquals(
      assess({
        transition: "budget_published",
        actorRole: "studio",
        eventId: "different-checkpoint",
        evidence: { ...evidence, budgetCheckpoint: checkpoint },
      }),
      { allowed: false, reason: "transition_not_committed" },
    );
    assertEquals(
      assess({
        transition: "budget_published",
        actorRole: "studio",
        eventId: "checkpoint-1",
        evidence: {
          ...evidence,
          budgetCheckpoint: { ...checkpoint, isCurrent: false },
        },
      }),
      { allowed: false, reason: "transition_not_committed" },
    );
  },
);

Deno.test(
  "furnishings transitions require acknowledged snapshot binding",
  () => {
    const furnishingsEvidence: CommercialTransitionEvidence = {
      ...evidence,
      studioSignature: false,
      projectDocument: {
        projectId: "project-1",
        documentKind: "furnishings_authorization",
        executedAt: "2026-08-03T13:00:00Z",
        budgetCheckpointId: "checkpoint-1",
        depositInvoiceId: null,
      },
      budgetCheckpoint: {
        id: "checkpoint-1",
        projectId: "project-1",
        status: "acknowledged",
        publishedAt: "2026-08-03T12:30:00Z",
        isCurrent: true,
      },
    };
    assertEquals(
      assess({
        transition: "furnishings_sent",
        actorRole: "studio",
        documentKind: "furnishings_authorization",
        commercialState: "sent",
        evidence: furnishingsEvidence,
      }),
      { allowed: true },
    );
    assertEquals(
      assess({
        transition: "furnishings_executed",
        actorRole: "client",
        documentKind: "furnishings_authorization",
        evidence: {
          ...furnishingsEvidence,
          budgetCheckpoint: {
            ...furnishingsEvidence.budgetCheckpoint!,
            status: "open",
          },
        },
      }),
      { allowed: false, reason: "transition_not_committed" },
    );
  },
);

Deno.test(
  "deposit-ready requires the linked payable invoice to remain outstanding",
  () => {
    const furnishingsEvidence: CommercialTransitionEvidence = {
      ...evidence,
      studioSignature: false,
      projectDocument: {
        projectId: "project-1",
        documentKind: "furnishings_authorization",
        executedAt: "2026-08-03T13:00:00Z",
        budgetCheckpointId: "checkpoint-1",
        depositInvoiceId: "invoice-1",
      },
      budgetCheckpoint: {
        id: "checkpoint-1",
        projectId: "project-1",
        status: "overridden",
        publishedAt: "2026-08-03T12:30:00Z",
        isCurrent: true,
      },
      depositInvoice: {
        id: "invoice-1",
        projectId: "project-1",
        status: "sent",
      },
    };
    assertEquals(
      assess({
        transition: "deposit_ready",
        actorRole: "client",
        documentKind: "furnishings_authorization",
        evidence: furnishingsEvidence,
      }),
      { allowed: true },
    );
    assertEquals(
      assess({
        transition: "deposit_ready",
        actorRole: "client",
        documentKind: "furnishings_authorization",
        evidence: {
          ...furnishingsEvidence,
          depositInvoice: {
            ...furnishingsEvidence.depositInvoice!,
            status: "paid",
          },
        },
      }),
      { allowed: false, reason: "transition_not_committed" },
    );
  },
);
