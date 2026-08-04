/**
 * App-local commercial-document contract.
 *
 * Wave 1 intentionally keeps this adapter beside the designer UI while the
 * canonical workspace DTOs land on the integration branch. Database rows are
 * mapped into these camel-case shapes at one boundary; components never read
 * raw commercial tables or spread their rows into a client preview.
 */

export const COMMERCIAL_DOCUMENT_KINDS = [
  "legacy",
  "design_services",
  "furnishings_authorization",
  "service_addendum",
] as const;

export type CommercialDocumentKind = (typeof COMMERCIAL_DOCUMENT_KINDS)[number];

export const COMMERCIAL_STATES = [
  "draft",
  "sent",
  "client_signed",
  "executed",
  "declined",
  "expired",
  "superseded",
] as const;

export type CommercialState = (typeof COMMERCIAL_STATES)[number];
export type RetainerActivationPolicy = "immediate" | "retainer_paid";
export type BillingCadence = "monthly" | "biweekly" | "milestone";

export interface CommercialDocument {
  id: string;
  projectId: string | null;
  kind: CommercialDocumentKind;
  state: CommercialState;
  title: string;
  version: number;
  waveName: string | null;
  sentAt: string | null;
  executedAt: string | null;
  supersededAt: string | null;
  replacementProposalId: string | null;
}

export interface ServiceAgreementTerms {
  proposalId: string;
  scope: string;
  deliverables: string[];
  exclusions: string[];
  billingCeilingCents: number;
  retainerAmountCents: number;
  retainerActivationPolicy: RetainerActivationPolicy;
  billingCadence: BillingCadence;
  currency: string;
  terms: string;
  currentRateVersion: number;
  updatedAt: string | null;
}

export interface ServiceRate {
  id: string;
  proposalId: string;
  version: number;
  roleName: string;
  hourlyRateCents: number;
  effectiveAt: string | null;
}

export interface CommercialSignature {
  party: "client" | "studio";
  signerName: string;
  signedAt: string;
  consentVersion: number;
  documentFingerprint: string;
}

export interface ProjectBillingAuthority {
  id: string;
  projectId: string;
  agreementId: string;
  state: "active" | "retainer_pending" | "exhausted" | "superseded";
  currency: string;
  ceilingCents: number;
  authorizedCents: number;
  accruedCents: number;
  invoicedCents: number;
  pendingAuthorizationCents: number;
  remainingCents: number;
  retainerAmountCents: number;
  retainerPaidCents: number;
  retainerActivationPolicy: RetainerActivationPolicy;
  activeRateVersion: number;
  billingThrough: string | null;
  rates: ServiceRate[];
}

export interface CountersignDesignServicesResult {
  proposalId: string;
  commercialState: CommercialState;
  projectId: string;
  agreementId: string;
  billingAuthorityId: string;
  newlyExecuted: boolean;
}

export type CommercialDocumentExperience =
  | "legacy"
  | "design_services"
  | "commercial_readonly";

export function commercialDocumentExperience(
  kind: string | null | undefined,
): CommercialDocumentExperience {
  switch (kind) {
    case "design_services":
      return "design_services";
    case "furnishings_authorization":
    case "service_addendum":
      return "commercial_readonly";
    case "legacy":
    default:
      return "legacy";
  }
}

export interface ServiceAgreementReadiness {
  ready: boolean;
  blockers: string[];
}

export function assessServiceAgreementReadiness({
  document,
  terms,
  rates,
  recipientEmail,
}: {
  document: CommercialDocument;
  terms: ServiceAgreementTerms | null | undefined;
  rates: ServiceRate[];
  recipientEmail: string | null | undefined;
}): ServiceAgreementReadiness {
  const blockers: string[] = [];

  if (document.kind !== "design_services") {
    blockers.push("Only a design services agreement can use this send review.");
  }
  if (document.state !== "draft") {
    blockers.push("Only a draft agreement can be sent.");
  }
  if (!terms?.scope.trim()) {
    blockers.push("Name the services included in this agreement.");
  }
  if (!terms?.deliverables.some((item) => item.trim().length > 0)) {
    blockers.push("Add at least one client deliverable.");
  }
  if (!terms?.exclusions.some((item) => item.trim().length > 0)) {
    blockers.push("State what is not included.");
  }
  if (
    !rates.some(
      (rate) =>
        rate.roleName.trim().length > 0 &&
        Number.isFinite(rate.hourlyRateCents) &&
        rate.hourlyRateCents > 0,
    )
  ) {
    blockers.push("Add at least one role with an hourly rate.");
  }
  if (
    !terms ||
    !Number.isFinite(terms.billingCeilingCents) ||
    terms.billingCeilingCents <= 0
  ) {
    blockers.push("Set the design authorization ceiling.");
  }
  if (
    !terms ||
    !Number.isFinite(terms.retainerAmountCents) ||
    terms.retainerAmountCents < 0
  ) {
    blockers.push(
      "Set a valid retainer amount, including zero when none is due.",
    );
  }
  if (!terms?.retainerActivationPolicy) {
    blockers.push("Choose when the agreement becomes active.");
  }
  if (!terms?.billingCadence) {
    blockers.push("Choose a billing cadence.");
  }
  if (!terms?.terms.trim()) {
    blockers.push("Write the agreement terms.");
  }
  if (!recipientEmail?.trim()) {
    blockers.push("Link a client with an email address.");
  }

  return { ready: blockers.length === 0, blockers };
}

/** The exact, allowlisted client-facing service agreement model. */
export interface ServiceAgreementPreview {
  title: string;
  version: number;
  state: CommercialState;
  scope: string;
  deliverables: string[];
  exclusions: string[];
  billingCeilingCents: number;
  retainerAmountCents: number;
  retainerActivationPolicy: RetainerActivationPolicy;
  billingCadence: BillingCadence;
  currency: string;
  terms: string;
  rates: Array<{ roleName: string; hourlyRateCents: number }>;
  signatures: Array<{
    party: "client" | "studio";
    signerName: string;
    signedAt: string;
  }>;
}

export function buildServiceAgreementPreview({
  document,
  terms,
  rates,
  signatures,
}: {
  document: CommercialDocument;
  terms: ServiceAgreementTerms;
  rates: ServiceRate[];
  signatures: CommercialSignature[];
}): ServiceAgreementPreview {
  return {
    title: document.title,
    version: document.version,
    state: document.state,
    scope: terms.scope,
    deliverables: terms.deliverables.filter((item) => item.trim()),
    exclusions: terms.exclusions.filter((item) => item.trim()),
    billingCeilingCents: terms.billingCeilingCents,
    retainerAmountCents: terms.retainerAmountCents,
    retainerActivationPolicy: terms.retainerActivationPolicy,
    billingCadence: terms.billingCadence,
    currency: terms.currency,
    terms: terms.terms,
    rates: rates
      .filter((rate) => rate.roleName.trim() && rate.hourlyRateCents > 0)
      .map((rate) => ({
        roleName: rate.roleName,
        hourlyRateCents: rate.hourlyRateCents,
      })),
    signatures: signatures.map((signature) => ({
      party: signature.party,
      signerName: signature.signerName,
      signedAt: signature.signedAt,
    })),
  };
}

export interface CommercialStatusView {
  label: string;
  description: string;
  tone: "quiet" | "clay" | "golden" | "sage" | "terracotta";
  canCountersign: boolean;
  isExecuted: boolean;
  isTerminal: boolean;
}

export function commercialStatusView(
  state: CommercialState,
): CommercialStatusView {
  switch (state) {
    case "draft":
      return {
        label: "DRAFT",
        description: "The agreement is still in the studio’s hands.",
        tone: "quiet",
        canCountersign: false,
        isExecuted: false,
        isTerminal: false,
      };
    case "sent":
      return {
        label: "WITH CLIENT",
        description:
          "Sent for the client’s signature. No work is authorized yet.",
        tone: "clay",
        canCountersign: false,
        isExecuted: false,
        isTerminal: false,
      };
    case "client_signed":
      return {
        label: "CLIENT SIGNED",
        description:
          "Client consent is preserved. The agreement is awaiting the studio countersignature; work is not yet authorized.",
        tone: "golden",
        canCountersign: true,
        isExecuted: false,
        isTerminal: false,
      };
    case "executed":
      return {
        label: "EXECUTED",
        description:
          "Both signatures are recorded and design work is authorized.",
        tone: "sage",
        canCountersign: false,
        isExecuted: true,
        isTerminal: false,
      };
    case "declined":
      return {
        label: "DECLINED",
        description: "The client declined this agreement.",
        tone: "terracotta",
        canCountersign: false,
        isExecuted: false,
        isTerminal: true,
      };
    case "expired":
      return {
        label: "EXPIRED",
        description: "This agreement expired without execution.",
        tone: "quiet",
        canCountersign: false,
        isExecuted: false,
        isTerminal: true,
      };
    case "superseded":
      return {
        label: "SUPERSEDED",
        description: "A newer commercial edition replaced this agreement.",
        tone: "quiet",
        canCountersign: false,
        isExecuted: false,
        isTerminal: true,
      };
  }
}

export function asCommercialDocumentKind(
  value: unknown,
): CommercialDocumentKind {
  return COMMERCIAL_DOCUMENT_KINDS.includes(value as CommercialDocumentKind)
    ? (value as CommercialDocumentKind)
    : "legacy";
}

export function asCommercialState(value: unknown): CommercialState {
  return COMMERCIAL_STATES.includes(value as CommercialState)
    ? (value as CommercialState)
    : "draft";
}
