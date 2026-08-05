import type { CommercialTransition } from "./core.ts";

export type CommercialActorRole = "client" | "studio" | "service" | "unknown";

export interface CommercialTransitionEvidence {
  clientSignature: boolean;
  studioSignature: boolean;
  projectDocument: {
    projectId: string;
    documentKind: string;
    executedAt: string | null;
    budgetCheckpointId: string | null;
    depositInvoiceId: string | null;
  } | null;
  budgetCheckpoint: {
    id: string;
    projectId: string;
    status: string;
    publishedAt: string | null;
    isCurrent: boolean;
  } | null;
  depositInvoice: {
    id: string;
    projectId: string;
    status: string;
  } | null;
  tradeScopeTerms: {
    acceptedAt: string | null;
  } | null;
  tradeScopeDraw: {
    id: string;
    invoiceStatus: string | null;
  } | null;
}

export interface CommercialTransitionPolicyInput {
  actorRole: CommercialActorRole;
  transition: CommercialTransition;
  documentKind: string;
  commercialState: string | null;
  eventId: string | null;
  evidence: CommercialTransitionEvidence;
}

export interface CommercialTransitionPolicyResult {
  allowed: boolean;
  reason?:
    | "actor_not_allowed"
    | "document_kind_not_allowed"
    | "transition_not_committed";
}

const STUDIO_TRANSITIONS = new Set<CommercialTransition>([
  "executed",
  "budget_published",
  "furnishings_sent",
  "trade_scope_sent",
  "trade_draw_ready",
]);

const CLIENT_TRANSITIONS = new Set<CommercialTransition>([
  "client_signed",
  "furnishings_executed",
  "deposit_ready",
  "trade_scope_executed",
  "trade_scope_accepted",
]);

const SERVICES_KINDS = new Set(["design_services", "service_addendum"]);

const SERVICES_TRANSITIONS = new Set<CommercialTransition>([
  "client_signed",
  "executed",
  "budget_published",
]);

const FURNISHINGS_ONLY_TRANSITIONS = new Set<CommercialTransition>([
  "furnishings_sent",
  "furnishings_executed",
]);

const TRADE_SCOPE_ONLY_TRANSITIONS = new Set<CommercialTransition>([
  "trade_scope_sent",
  "trade_scope_executed",
  "trade_scope_accepted",
  "trade_draw_ready",
]);

/** Transitions whose idempotency/evidence key is a sub-document event id
 * rather than the commercial document id itself (mirrors budget_published's
 * checkpoint-id keying). */
const EVENT_SCOPED_TRANSITIONS = new Set<CommercialTransition>([
  "budget_published",
  "trade_draw_ready",
]);

export function actorCanNotify(
  actorRole: CommercialActorRole,
  transition: CommercialTransition,
): boolean {
  if (actorRole === "service") return true;
  if (actorRole === "studio") return STUDIO_TRANSITIONS.has(transition);
  if (actorRole === "client") return CLIENT_TRANSITIONS.has(transition);
  return false;
}

export function documentKindCanNotify(
  documentKind: string,
  transition: CommercialTransition,
): boolean {
  if (SERVICES_TRANSITIONS.has(transition)) {
    return SERVICES_KINDS.has(documentKind);
  }
  if (FURNISHINGS_ONLY_TRANSITIONS.has(transition)) {
    return documentKind === "furnishings_authorization";
  }
  if (TRADE_SCOPE_ONLY_TRANSITIONS.has(transition)) {
    return documentKind === "trade_scope";
  }
  if (transition === "deposit_ready") {
    return documentKind === "furnishings_authorization" ||
      documentKind === "trade_scope";
  }
  return false;
}

/** Document-scoped transitions are, well, document-scoped. Rejecting a
 * caller-supplied event id prevents arbitrary UUIDs from manufacturing
 * another idempotency key for the same committed act. Event-scoped
 * transitions (a budget checkpoint, a trade draw) key off that sub-document
 * event id instead. */
export function commercialNotificationEventKey(
  transition: CommercialTransition,
  documentId: string,
  eventId: string | null,
): string | null {
  if (EVENT_SCOPED_TRANSITIONS.has(transition)) return eventId || null;
  return eventId === null ? documentId : null;
}

function hasExecutedServicesEvidence(
  input: CommercialTransitionPolicyInput,
): boolean {
  const document = input.evidence.projectDocument;
  return (
    input.commercialState === "executed" &&
    input.evidence.clientSignature &&
    input.evidence.studioSignature &&
    document !== null &&
    document.documentKind === input.documentKind &&
    Boolean(document.executedAt)
  );
}

function hasBoundFurnishingsEvidence(
  input: CommercialTransitionPolicyInput,
): boolean {
  const document = input.evidence.projectDocument;
  const checkpoint = input.evidence.budgetCheckpoint;
  return (
    document !== null &&
    document.documentKind === "furnishings_authorization" &&
    Boolean(document.budgetCheckpointId) &&
    checkpoint !== null &&
    checkpoint.id === document.budgetCheckpointId &&
    checkpoint.projectId === document.projectId &&
    Boolean(checkpoint.publishedAt) &&
    (checkpoint.status === "acknowledged" || checkpoint.status === "overridden")
  );
}

/** Trade scope has no working-budget checkpoint to bind against — the
 * project_commercial_documents row itself, scoped to this proposal by the
 * caller, is the whole of the binding. */
function hasBoundTradeScopeEvidence(
  input: CommercialTransitionPolicyInput,
): boolean {
  const document = input.evidence.projectDocument;
  return document !== null && document.documentKind === "trade_scope";
}

export function assessCommercialTransition(
  input: CommercialTransitionPolicyInput,
): CommercialTransitionPolicyResult {
  if (!actorCanNotify(input.actorRole, input.transition)) {
    return { allowed: false, reason: "actor_not_allowed" };
  }
  if (!documentKindCanNotify(input.documentKind, input.transition)) {
    return { allowed: false, reason: "document_kind_not_allowed" };
  }

  const { evidence } = input;
  switch (input.transition) {
    case "client_signed":
      return (input.commercialState === "client_signed" ||
          input.commercialState === "executed") &&
          evidence.clientSignature
        ? { allowed: true }
        : { allowed: false, reason: "transition_not_committed" };
    case "executed":
      return hasExecutedServicesEvidence(input)
        ? { allowed: true }
        : { allowed: false, reason: "transition_not_committed" };
    case "budget_published": {
      const document = evidence.projectDocument;
      const checkpoint = evidence.budgetCheckpoint;
      return hasExecutedServicesEvidence(input) &&
        Boolean(input.eventId) &&
        checkpoint !== null &&
        checkpoint.id === input.eventId &&
        document !== null &&
        checkpoint.projectId === document.projectId &&
        Boolean(checkpoint.publishedAt) &&
        checkpoint.isCurrent
        ? { allowed: true }
        : { allowed: false, reason: "transition_not_committed" };
    }
    case "furnishings_sent":
      return input.commercialState === "sent" &&
        hasBoundFurnishingsEvidence(input)
        ? { allowed: true }
        : { allowed: false, reason: "transition_not_committed" };
    case "furnishings_executed":
      return input.commercialState === "executed" &&
        evidence.clientSignature &&
        Boolean(evidence.projectDocument?.executedAt) &&
        hasBoundFurnishingsEvidence(input)
        ? { allowed: true }
        : { allowed: false, reason: "transition_not_committed" };
    case "deposit_ready": {
      const document = evidence.projectDocument;
      const invoice = evidence.depositInvoice;
      const bound = document?.documentKind === "furnishings_authorization"
        ? hasBoundFurnishingsEvidence(input)
        : document?.documentKind === "trade_scope"
          ? hasBoundTradeScopeEvidence(input)
          : false;
      return input.commercialState === "executed" &&
        evidence.clientSignature &&
        Boolean(document?.executedAt) &&
        bound &&
        document !== null &&
        invoice !== null &&
        invoice.id === document.depositInvoiceId &&
        invoice.projectId === document.projectId &&
        (invoice.status === "sent" || invoice.status === "partially_paid")
        ? { allowed: true }
        : { allowed: false, reason: "transition_not_committed" };
    }
    case "trade_scope_sent":
      return input.commercialState === "sent" &&
        hasBoundTradeScopeEvidence(input)
        ? { allowed: true }
        : { allowed: false, reason: "transition_not_committed" };
    case "trade_scope_executed":
      return input.commercialState === "executed" &&
        evidence.clientSignature &&
        Boolean(evidence.projectDocument?.executedAt) &&
        hasBoundTradeScopeEvidence(input)
        ? { allowed: true }
        : { allowed: false, reason: "transition_not_committed" };
    case "trade_scope_accepted": {
      const terms = evidence.tradeScopeTerms;
      return input.commercialState === "executed" &&
        Boolean(evidence.projectDocument?.executedAt) &&
        hasBoundTradeScopeEvidence(input) &&
        terms !== null &&
        Boolean(terms.acceptedAt)
        ? { allowed: true }
        : { allowed: false, reason: "transition_not_committed" };
    }
    case "trade_draw_ready": {
      const draw = evidence.tradeScopeDraw;
      return input.commercialState === "executed" &&
        hasBoundTradeScopeEvidence(input) &&
        Boolean(input.eventId) &&
        draw !== null &&
        draw.id === input.eventId &&
        (draw.invoiceStatus === "sent" || draw.invoiceStatus === "partially_paid")
        ? { allowed: true }
        : { allowed: false, reason: "transition_not_committed" };
    }
  }
}
