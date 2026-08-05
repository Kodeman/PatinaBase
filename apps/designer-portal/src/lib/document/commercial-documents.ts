/**
 * App-local commercial-document contract.
 *
 * Wave 1 intentionally keeps this adapter beside the designer UI while the
 * canonical workspace DTOs land on the integration branch. Database rows are
 * mapped into these camel-case shapes at one boundary; components never read
 * raw commercial tables or spread their rows into a client preview.
 */

import { formatCalendarDate } from "./format";

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
  /** R8: the deposit percent the studio commits to on EACH furnishings
   *  authorization released under this agreement (0–100). A term of the
   *  design services agreement, not of any one authorization — chips in the
   *  drafting room offer 0/25/50/100/other. Nullable by design — the studio
   *  may leave it unset, and create_furnishings_authorization_from_schedule
   *  (00422) falls back to a 50% house default at release time. */
  furnishingsDepositPercent: number | null;
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
  /** True when this signature was recorded from a printed original the
   *  studio countersigned/executed on the client's behalf (00412's paper
   *  RPCs), rather than signed on screen. */
  executedOnPaper: boolean;
  /** The day written on the paper — bare `YYYY-MM-DD`, exactly as the studio
   *  typed it into the record sheet (00425's metadata.paperSignedOn). THIS is
   *  when the signature happened; `signedAt` is when it was written down, and
   *  on this rail those are different days. Null on portal signatures, where
   *  they are the same moment. */
  paperSignedOn: string | null;
  /** The project_documents.id of the paper original's scan, when the studio
   *  attached one at record time. Null when no scan was attached. */
  paperScanDocumentId: string | null;
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
  /** R8: the executed agreement's furnishings deposit term, carried onto the
   *  authority so a new release can default to it. Null until the server
   *  adds it to get_project_authority_summary's envelope. */
  furnishingsDepositPercent: number | null;
}

export interface CountersignDesignServicesResult {
  proposalId: string;
  commercialState: CommercialState;
  projectId: string;
  agreementId: string;
  billingAuthorityId: string;
  newlyExecuted: boolean;
  notificationDelivery?: "delivered" | "pending_retry" | "not_requested";
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
    case "service_addendum":
      return "design_services";
    case "furnishings_authorization":
      return "commercial_readonly";
    case "legacy":
    default:
      return "legacy";
  }
}

export interface ServiceAgreementReadiness {
  ready: boolean;
  blockers: string[];
  /** Advisory only — never gates "ready". */
  notes: string[];
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
  const notes: string[] = [];

  if (
    document.kind !== "design_services" &&
    document.kind !== "service_addendum"
  ) {
    blockers.push(
      "Only a design services agreement or addendum can use this send review.",
    );
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
  // Nullable by design (00422) — unset is not a defect, it's a decision the
  // studio hasn't made yet, and the release RPC falls back to 50% on its
  // own. Only a value that IS present and out of bounds blocks the send.
  if (terms && terms.furnishingsDepositPercent !== null) {
    if (
      !Number.isFinite(terms.furnishingsDepositPercent) ||
      terms.furnishingsDepositPercent < 0 ||
      terms.furnishingsDepositPercent > 100
    ) {
      blockers.push(
        "Set the furnishings deposit percent, including zero when none is due.",
      );
    }
  } else if (terms) {
    notes.push(
      "No furnishings deposit set — authorizations will default to 50%.",
    );
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

  return { ready: blockers.length === 0, blockers, notes };
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
  furnishingsDepositPercent: number | null;
  rates: Array<{ roleName: string; hourlyRateCents: number }>;
  signatures: Array<{
    party: "client" | "studio";
    signerName: string;
    signedAt: string;
    executedOnPaper: boolean;
    paperSignedOn: string | null;
    paperScanDocumentId: string | null;
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
    furnishingsDepositPercent: terms.furnishingsDepositPercent,
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
      executedOnPaper: signature.executedOnPaper,
      paperSignedOn: signature.paperSignedOn,
      paperScanDocumentId: signature.paperScanDocumentId,
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

/** The exact phrase every paper-provenance surface uses — the preview's
 *  signature blocks, and commercialStatusView's description below, print
 *  this same sentence rather than each inventing their own wording. */
export const SIGNED_ON_PAPER_NOTE = "Signed on paper · recorded by the studio.";

/**
 * The same sentence, dated — because a paper act has two days and the studio
 * should be able to see which is which without opening the row.
 *
 * `paperSignedOn` is the day on the page; the record moment lives in
 * `signedAt` and stays where it is. Falls back to the undated phrase when the
 * date is missing, so a row recorded before 00425 carried the key still reads
 * as a sentence rather than as "Signed null on paper".
 */
export function signedOnPaperNote(paperSignedOn?: string | null): string {
  const day = formatCalendarDate(paperSignedOn);
  return day
    ? `Signed ${day} on paper · recorded by the studio.`
    : SIGNED_ON_PAPER_NOTE;
}

export function commercialStatusView(
  state: CommercialState,
  options?: {
    /** True when the client's own signature on this document was recorded
     *  from a printed original (record_paper_client_signature) rather than
     *  signed on screen. Appends {@link SIGNED_ON_PAPER_NOTE} to the
     *  description once consent exists to describe (client_signed onward) —
     *  never for draft/sent, where there is nothing yet to have been paper. */
    clientSignedOnPaper?: boolean;
    /** The day written on that paper, when known — promotes the appended
     *  sentence to its dated form (see {@link signedOnPaperNote}). */
    clientPaperSignedOn?: string | null;
  },
): CommercialStatusView {
  const base = ((): CommercialStatusView => {
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
  })();

  if (
    options?.clientSignedOnPaper &&
    (state === "client_signed" || state === "executed")
  ) {
    return {
      ...base,
      description: `${base.description} ${signedOnPaperNote(options.clientPaperSignedOn)}`,
    };
  }
  return base;
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
