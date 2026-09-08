import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  actorCanNotify,
  assessCommercialTransition,
  commercialNotificationEventKey,
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
  tradeScopeTerms: null,
  tradeScopeDraw: null,
  agreementDraw: null,
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

Deno.test("non-budget idempotency is strictly document-scoped", () => {
  assertEquals(
    commercialNotificationEventKey("executed", "document-1", null),
    "document-1",
  );
  assertEquals(
    commercialNotificationEventKey("executed", "document-1", "attacker-uuid-1"),
    null,
  );
  assertEquals(
    commercialNotificationEventKey("executed", "document-1", "attacker-uuid-2"),
    null,
  );
  assertEquals(
    commercialNotificationEventKey(
      "budget_published",
      "document-1",
      "checkpoint-1",
    ),
    "checkpoint-1",
  );
});

Deno.test(
  "client-signed replay remains valid after studio execution",
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
      { allowed: true },
    );
    assertEquals(
      assess({
        transition: "client_signed",
        actorRole: "client",
        commercialState: "sent",
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

Deno.test("trade scope actor matrix mirrors furnishings' split authority", () => {
  assertEquals(actorCanNotify("studio", "trade_scope_sent"), true);
  assertEquals(actorCanNotify("studio", "trade_draw_ready"), true);
  assertEquals(actorCanNotify("studio", "trade_scope_executed"), false);
  assertEquals(actorCanNotify("studio", "trade_scope_accepted"), false);
  assertEquals(actorCanNotify("client", "trade_scope_executed"), true);
  assertEquals(actorCanNotify("client", "trade_scope_accepted"), true);
  assertEquals(actorCanNotify("client", "trade_scope_sent"), false);
  assertEquals(actorCanNotify("client", "trade_draw_ready"), false);
  assertEquals(actorCanNotify("service", "trade_scope_accepted"), true);
});

Deno.test(
  "trade scope kind matrix stays off other rails; deposit-ready spans both",
  () => {
    assertEquals(documentKindCanNotify("trade_scope", "trade_scope_sent"), true);
    assertEquals(
      documentKindCanNotify("trade_scope", "trade_scope_executed"),
      true,
    );
    assertEquals(
      documentKindCanNotify("trade_scope", "trade_scope_accepted"),
      true,
    );
    assertEquals(documentKindCanNotify("trade_scope", "trade_draw_ready"), true);
    assertEquals(
      documentKindCanNotify("furnishings_authorization", "trade_scope_sent"),
      false,
    );
    assertEquals(
      documentKindCanNotify("design_services", "trade_draw_ready"),
      false,
    );
    assertEquals(documentKindCanNotify("trade_scope", "furnishings_sent"), false);
    assertEquals(documentKindCanNotify("trade_scope", "deposit_ready"), true);
    assertEquals(
      documentKindCanNotify("furnishings_authorization", "deposit_ready"),
      true,
    );
    assertEquals(documentKindCanNotify("design_services", "deposit_ready"), false);
  },
);

Deno.test("trade draw ready is event-scoped like budget publication", () => {
  assertEquals(
    commercialNotificationEventKey("trade_draw_ready", "document-1", "draw-1"),
    "draw-1",
  );
  assertEquals(
    commercialNotificationEventKey("trade_draw_ready", "document-1", null),
    null,
  );
  assertEquals(
    commercialNotificationEventKey("trade_scope_sent", "document-1", null),
    "document-1",
  );
  assertEquals(
    commercialNotificationEventKey(
      "trade_scope_sent",
      "document-1",
      "attacker-uuid",
    ),
    null,
  );
});

Deno.test(
  "trade scope sent/executed require the trade pcd binding, not a budget checkpoint",
  () => {
    const tradeScopeEvidence: CommercialTransitionEvidence = {
      ...evidence,
      studioSignature: false,
      projectDocument: {
        projectId: "project-1",
        documentKind: "trade_scope",
        executedAt: null,
        budgetCheckpointId: null,
        depositInvoiceId: null,
      },
      budgetCheckpoint: null,
    };
    assertEquals(
      assess({
        transition: "trade_scope_sent",
        actorRole: "studio",
        documentKind: "trade_scope",
        commercialState: "sent",
        evidence: tradeScopeEvidence,
      }),
      { allowed: true },
    );
    assertEquals(
      assess({
        transition: "trade_scope_sent",
        actorRole: "client",
        documentKind: "trade_scope",
        commercialState: "sent",
        evidence: tradeScopeEvidence,
      }),
      { allowed: false, reason: "actor_not_allowed" },
    );
    assertEquals(
      assess({
        transition: "trade_scope_sent",
        actorRole: "studio",
        documentKind: "trade_scope",
        commercialState: "sent",
        evidence: { ...tradeScopeEvidence, projectDocument: null },
      }),
      { allowed: false, reason: "transition_not_committed" },
    );

    const executedEvidence: CommercialTransitionEvidence = {
      ...tradeScopeEvidence,
      clientSignature: true,
      projectDocument: {
        ...tradeScopeEvidence.projectDocument!,
        executedAt: "2026-08-03T13:00:00Z",
      },
    };
    assertEquals(
      assess({
        transition: "trade_scope_executed",
        actorRole: "client",
        documentKind: "trade_scope",
        commercialState: "executed",
        evidence: executedEvidence,
      }),
      { allowed: true },
    );
    assertEquals(
      assess({
        transition: "trade_scope_executed",
        actorRole: "client",
        documentKind: "trade_scope",
        commercialState: "executed",
        evidence: { ...executedEvidence, clientSignature: false },
      }),
      { allowed: false, reason: "transition_not_committed" },
    );
  },
);

Deno.test(
  "trade scope accepted requires trade_scope_terms.accepted_at, not just execution",
  () => {
    const executedTradeScope: CommercialTransitionEvidence = {
      ...evidence,
      studioSignature: false,
      clientSignature: true,
      projectDocument: {
        projectId: "project-1",
        documentKind: "trade_scope",
        executedAt: "2026-08-03T13:00:00Z",
        budgetCheckpointId: null,
        depositInvoiceId: null,
      },
      budgetCheckpoint: null,
      tradeScopeTerms: { acceptedAt: "2026-08-04T09:00:00Z" },
    };
    assertEquals(
      assess({
        transition: "trade_scope_accepted",
        actorRole: "client",
        documentKind: "trade_scope",
        commercialState: "executed",
        evidence: executedTradeScope,
      }),
      { allowed: true },
    );
    assertEquals(
      assess({
        transition: "trade_scope_accepted",
        actorRole: "client",
        documentKind: "trade_scope",
        commercialState: "executed",
        evidence: {
          ...executedTradeScope,
          tradeScopeTerms: { acceptedAt: null },
        },
      }),
      { allowed: false, reason: "transition_not_committed" },
    );
    assertEquals(
      assess({
        transition: "trade_scope_accepted",
        actorRole: "client",
        documentKind: "trade_scope",
        commercialState: "executed",
        evidence: { ...executedTradeScope, tradeScopeTerms: null },
      }),
      { allowed: false, reason: "transition_not_committed" },
    );
    assertEquals(
      assess({
        transition: "trade_scope_accepted",
        actorRole: "studio",
        documentKind: "trade_scope",
        commercialState: "executed",
        evidence: executedTradeScope,
      }),
      { allowed: false, reason: "actor_not_allowed" },
    );
  },
);

Deno.test(
  "trade draw ready is keyed to the named draw's invoice and rejects a forged eventId",
  () => {
    const executedTradeScope: CommercialTransitionEvidence = {
      ...evidence,
      studioSignature: false,
      clientSignature: true,
      projectDocument: {
        projectId: "project-1",
        documentKind: "trade_scope",
        executedAt: "2026-08-03T13:00:00Z",
        budgetCheckpointId: null,
        depositInvoiceId: null,
      },
      budgetCheckpoint: null,
      tradeScopeDraw: { id: "draw-1", invoiceStatus: "sent" },
    };
    assertEquals(
      assess({
        transition: "trade_draw_ready",
        actorRole: "studio",
        documentKind: "trade_scope",
        commercialState: "executed",
        eventId: "draw-1",
        evidence: executedTradeScope,
      }),
      { allowed: true },
    );
    // The evidence loader scopes its draw lookup to (id, proposal_id); a
    // forged or cross-proposal eventId simply never resolves a draw.
    assertEquals(
      assess({
        transition: "trade_draw_ready",
        actorRole: "studio",
        documentKind: "trade_scope",
        commercialState: "executed",
        eventId: "attacker-draw",
        evidence: { ...executedTradeScope, tradeScopeDraw: null },
      }),
      { allowed: false, reason: "transition_not_committed" },
    );
    assertEquals(
      assess({
        transition: "trade_draw_ready",
        actorRole: "studio",
        documentKind: "trade_scope",
        commercialState: "executed",
        eventId: "draw-1",
        evidence: {
          ...executedTradeScope,
          tradeScopeDraw: { id: "draw-1", invoiceStatus: "paid" },
        },
      }),
      { allowed: false, reason: "transition_not_committed" },
    );
  },
);

Deno.test(
  "deposit-ready now spans furnishings and trade scope without cross-binding them",
  () => {
    const tradeScopeDeposit: CommercialTransitionEvidence = {
      ...evidence,
      studioSignature: false,
      clientSignature: true,
      projectDocument: {
        projectId: "project-1",
        documentKind: "trade_scope",
        executedAt: "2026-08-03T13:00:00Z",
        budgetCheckpointId: null,
        depositInvoiceId: "invoice-2",
      },
      budgetCheckpoint: null,
      depositInvoice: {
        id: "invoice-2",
        projectId: "project-1",
        status: "sent",
      },
    };
    assertEquals(
      assess({
        transition: "deposit_ready",
        actorRole: "client",
        documentKind: "trade_scope",
        commercialState: "executed",
        evidence: tradeScopeDeposit,
      }),
      { allowed: true },
    );
    // documentKindCanNotify already refuses a design_services document for
    // deposit_ready — the trade-scope-shaped evidence is beside the point.
    assertEquals(
      assess({
        transition: "deposit_ready",
        actorRole: "client",
        documentKind: "design_services",
        commercialState: "executed",
        evidence: tradeScopeDeposit,
      }),
      { allowed: false, reason: "document_kind_not_allowed" },
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

// ─── design-build (Wave 3) ───────────────────────────────────────────────────

Deno.test(
  "design-build joins the services rail but is kept off deposit_ready (DENO-1)",
  () => {
    assertEquals(documentKindCanNotify("design_build", "client_signed"), true);
    assertEquals(documentKindCanNotify("design_build", "executed"), true);
    assertEquals(documentKindCanNotify("design_build", "budget_published"), true);
    // The turnkey deposit reaches the client on the door, in the same act as
    // their signature — an email here would be a second, contradictory notice.
    assertEquals(documentKindCanNotify("design_build", "deposit_ready"), false);
    assertEquals(
      documentKindCanNotify("design_build", "agreement_draw_ready"),
      true,
    );
    assertEquals(
      documentKindCanNotify("trade_scope", "agreement_draw_ready"),
      false,
    );
    assertEquals(
      documentKindCanNotify("design_services", "agreement_draw_ready"),
      false,
    );
    assertEquals(
      documentKindCanNotify("furnishings_authorization", "agreement_draw_ready"),
      false,
    );
    // The prime's own draw rail is not the trade-scope rail, in either
    // direction.
    assertEquals(documentKindCanNotify("design_build", "trade_draw_ready"), false);
    assertEquals(documentKindCanNotify("design_build", "furnishings_sent"), false);
    assertEquals(documentKindCanNotify("design_build", "trade_scope_sent"), false);
  },
);

Deno.test("agreement draw ready is the studio's act and is event-scoped", () => {
  assertEquals(actorCanNotify("studio", "agreement_draw_ready"), true);
  assertEquals(actorCanNotify("client", "agreement_draw_ready"), false);
  assertEquals(actorCanNotify("service", "agreement_draw_ready"), true);
  assertEquals(actorCanNotify("unknown", "agreement_draw_ready"), false);
  assertEquals(
    commercialNotificationEventKey(
      "agreement_draw_ready",
      "document-1",
      "draw-2",
    ),
    "draw-2",
  );
  assertEquals(
    commercialNotificationEventKey("agreement_draw_ready", "document-1", null),
    null,
  );
});

Deno.test(
  "agreement draw ready needs an executed design-build prime and an issued invoice on the named draw (DENO-2)",
  () => {
    const executedDesignBuild: CommercialTransitionEvidence = {
      ...evidence,
      projectDocument: {
        projectId: "project-1",
        documentKind: "design_build",
        executedAt: "2026-09-07T13:00:00Z",
        budgetCheckpointId: null,
        depositInvoiceId: null,
      },
      agreementDraw: { id: "draw-2", invoiceStatus: "sent" },
    };
    const committed = {
      transition: "agreement_draw_ready" as const,
      actorRole: "studio" as const,
      documentKind: "design_build",
      commercialState: "executed",
      eventId: "draw-2",
      evidence: executedDesignBuild,
    };
    assertEquals(assess(committed), { allowed: true });
    assertEquals(
      assess({
        ...committed,
        evidence: {
          ...executedDesignBuild,
          agreementDraw: { id: "draw-2", invoiceStatus: "partially_paid" },
        },
      }),
      { allowed: true },
    );
    // Not yet executed — the studio has not countersigned.
    assertEquals(assess({ ...committed, commercialState: "client_signed" }), {
      allowed: false,
      reason: "transition_not_committed",
    });
    // No bound project document at all.
    assertEquals(
      assess({
        ...committed,
        evidence: { ...executedDesignBuild, projectDocument: null },
      }),
      { allowed: false, reason: "transition_not_committed" },
    );
    // Bound to another rail's document.
    assertEquals(
      assess({
        ...committed,
        evidence: {
          ...executedDesignBuild,
          projectDocument: {
            ...executedDesignBuild.projectDocument!,
            documentKind: "trade_scope",
          },
        },
      }),
      { allowed: false, reason: "transition_not_committed" },
    );
    // No eventId names a draw.
    assertEquals(assess({ ...committed, eventId: null }), {
      allowed: false,
      reason: "transition_not_committed",
    });
    // The evidence loader scopes its lookup to (id, proposal_id), so a forged
    // or cross-proposal eventId simply resolves no ledger row.
    assertEquals(
      assess({
        ...committed,
        eventId: "attacker-draw",
        evidence: { ...executedDesignBuild, agreementDraw: null },
      }),
      { allowed: false, reason: "transition_not_committed" },
    );
    // A draw resolved, but not the one the caller named.
    assertEquals(
      assess({ ...committed, eventId: "draw-3" }),
      { allowed: false, reason: "transition_not_committed" },
    );
    // The draw's invoice is not out for payment.
    for (const invoiceStatus of [null, "draft", "paid", "void"]) {
      assertEquals(
        assess({
          ...committed,
          evidence: {
            ...executedDesignBuild,
            agreementDraw: { id: "draw-2", invoiceStatus },
          },
        }),
        { allowed: false, reason: "transition_not_committed" },
        `invoiceStatus ${String(invoiceStatus)} must not notify`,
      );
    }
  },
);
