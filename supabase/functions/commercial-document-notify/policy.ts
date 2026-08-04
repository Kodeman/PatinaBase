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
]);

const CLIENT_TRANSITIONS = new Set<CommercialTransition>([
  "client_signed",
  "furnishings_executed",
  "deposit_ready",
]);

const SERVICES_KINDS = new Set(["design_services", "service_addendum"]);

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
  if (
    transition === "client_signed" ||
    transition === "executed" ||
    transition === "budget_published"
  ) {
    return SERVICES_KINDS.has(documentKind);
  }
  return documentKind === "furnishings_authorization";
}

/** Non-budget transitions are document-scoped. Rejecting a caller-supplied
 * event id prevents arbitrary UUIDs from manufacturing another idempotency
 * key for the same committed act. */
export function commercialNotificationEventKey(
  transition: CommercialTransition,
  documentId: string,
  eventId: string | null,
): string | null {
  if (transition === "budget_published") return eventId || null;
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
      return input.commercialState === "client_signed" &&
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
      return input.commercialState === "executed" &&
        evidence.clientSignature &&
        Boolean(document?.executedAt) &&
        hasBoundFurnishingsEvidence(input) &&
        document !== null &&
        invoice !== null &&
        invoice.id === document.depositInvoiceId &&
        invoice.projectId === document.projectId &&
        (invoice.status === "sent" || invoice.status === "partially_paid")
        ? { allowed: true }
        : { allowed: false, reason: "transition_not_committed" };
    }
  }
}
