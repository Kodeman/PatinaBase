/**
 * Commercial document and authority contracts.
 *
 * These are portal-facing domain shapes. Database rows remain generated in
 * `@patina/supabase`; callers should map snake_case rows into these camelCase
 * contracts at the data-access boundary.
 */

export const COMMERCIAL_DOCUMENT_KINDS = [
  'legacy',
  'design_services',
  'furnishings_authorization',
  'service_addendum',
  'trade_scope',
] as const;

export type CommercialDocumentKind = (typeof COMMERCIAL_DOCUMENT_KINDS)[number];

export const COMMERCIAL_STATES = [
  'draft',
  'sent',
  'client_signed',
  'executed',
  'declined',
  'expired',
  'superseded',
] as const;

export type CommercialState = (typeof COMMERCIAL_STATES)[number];

export type RetainerActivationPolicy = 'immediate' | 'retainer_paid';
export type BillingCadence = 'monthly' | 'biweekly' | 'milestone';
export type CommercialSignatureParty = 'client' | 'studio';
export type TimeBillingState = 'authorized' | 'pending_authorization' | 'nonbillable';
// DB values (project_budget_checkpoints.status, 00412/00422): a checkpoint is
// 'open' the moment it's published and stays there until the client
// acknowledges it or the designer records an audited override. 'open' is the
// unacknowledged state — never rendered or read as though it were terminal.
export type BudgetCheckpointState = 'open' | 'acknowledged' | 'overridden';

export interface DesignServiceTerms {
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
  updatedAt: string;
}

export interface DesignServiceRate {
  id: string;
  proposalId: string;
  version: number;
  roleName: string;
  hourlyRateCents: number;
  effectiveAt: string;
}

export interface CommercialSignatureReceipt {
  id: string;
  proposalId: string;
  party: CommercialSignatureParty;
  signerUserId: string | null;
  signerName: string;
  signedAt: string;
  consentVersion: string;
  documentFingerprint: string;
}

export interface CommercialDocumentSummary {
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

export interface DesignServicesAgreement extends CommercialDocumentSummary {
  kind: 'design_services' | 'service_addendum';
  terms: DesignServiceTerms;
  rates: DesignServiceRate[];
  signatures: CommercialSignatureReceipt[];
}

export interface ProjectBillingAuthoritySummary {
  id: string;
  projectId: string;
  agreementId: string;
  state: 'active' | 'retainer_pending' | 'exhausted' | 'superseded';
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
  rates: DesignServiceRate[];
}

export interface WorkingBudgetLine {
  id: string;
  versionId: string;
  roomId: string | null;
  roomName: string;
  category: string;
  lowCents: number;
  targetCents: number;
  highCents: number;
  notes: string | null;
  sortOrder: number;
}

export interface WorkingBudgetVersion {
  id: string;
  projectId: string;
  version: number;
  state: 'draft' | 'published' | 'superseded';
  currency: string;
  lowTotalCents: number;
  targetTotalCents: number;
  highTotalCents: number;
  lines: WorkingBudgetLine[];
  createdAt: string;
  publishedAt: string | null;
}

export interface WorkingBudgetCheckpoint {
  id: string;
  projectId: string;
  versionId: string;
  state: BudgetCheckpointState;
  publishedAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  overrideAt: string | null;
  overrideBy: string | null;
  overrideReason: string | null;
}

export interface FurnishingsAuthorizationItem {
  id: string;
  documentId: string;
  sourceProposalItemId: string | null;
  productId: string | null;
  description: string;
  quantity: number;
  clientUnitPriceCents: number;
  tradeUnitPriceCents: number | null;
  currency: string;
}

export interface FurnishingsAuthorization extends CommercialDocumentSummary {
  kind: 'furnishings_authorization';
  projectId: string;
  waveName: string;
  checkpointId: string | null;
  depositRequiredCents: number;
  depositPaidCents: number;
  items: FurnishingsAuthorizationItem[];
  signatures: CommercialSignatureReceipt[];
}

export interface FurnishingsAuthorizationDraftResult {
  proposalId: string;
  documentId: string;
  projectId: string;
  waveName: string;
  commercialState: 'draft';
  budgetCheckpointId: string;
  itemCount: number;
  documentFingerprint: string;
}

// A trade scope's own progress vocabulary — distinct from FFEStageKey, which
// tracks goods through procurement. A trade scope tracks a sub through the
// work itself: 'none' before the studio engages them (a state a client never
// actually sees, since presence lines only exist from 'engaged' on), forward-
// ratcheting through 'accepted'. Never conflate with CommercialState, which
// tracks the DOCUMENT (draft → sent → executed …) — a trade scope's document
// reaches 'executed' in one act and then sits there while progressState keeps
// moving underneath it.
export const TRADE_SCOPE_PROGRESS_STATES = [
  'none',
  'engaged',
  'in_progress',
  'substantially_complete',
  'accepted',
] as const;

export type TradeScopeProgressState = (typeof TRADE_SCOPE_PROGRESS_STATES)[number];

/** Client-safe party projection — never email/phone/party_id (RLS-adjacent
 * discipline enforced by get_client_commercial_document_bundle, not by this
 * type, but the type documents the contract). */
export interface TradeScopeParty {
  displayName: string;
  company: string | null;
  trade: string | null;
}

export interface TradeScopeSection {
  roomName: string;
  projectRoomId: string | null;
  /** The exact scope-of-work text the sub priced — rendered verbatim, never summarized. */
  prose: string;
  allocationCents: number | null;
  sortOrder: number;
}

export interface TradeScopeDraw {
  id: string;
  label: string;
  /** Display-only — amountCents is the canonical figure a draw bills for. */
  percentage: number | null;
  amountCents: number;
  sortOrder: number;
  gatesOnAcceptance: boolean;
  invoiceId: string | null;
  invoiceStatus: string | null;
  invoicePaidCents: number;
}

export interface TradeScopeProgress {
  state: TradeScopeProgressState;
  engagedAt: string | null;
  substantialCompletionAt: string | null;
  acceptedAt: string | null;
  acceptedSignedName: string | null;
}

export interface TradeScopeAuthorization extends CommercialDocumentSummary {
  kind: 'trade_scope';
  projectId: string;
  party: TradeScopeParty;
  clientPriceCents: number;
  currency: string;
  sections: TradeScopeSection[];
  draws: TradeScopeDraw[];
  progress: TradeScopeProgress;
  depositInvoiceId: string | null;
  signatures: CommercialSignatureReceipt[];
}

export interface TradeScopeExecutionResult {
  proposalId: string;
  commercialState: CommercialState;
  projectId: string;
  documentId: string;
  depositInvoiceId: string | null;
  newlyExecuted: boolean;
}

export interface ClientCommercialDocumentBundle {
  document:
    | DesignServicesAgreement
    | FurnishingsAuthorization
    | TradeScopeAuthorization
    | CommercialDocumentSummary;
  authority: ProjectBillingAuthoritySummary | null;
  budgetVersion: WorkingBudgetVersion | null;
  budgetCheckpoint: WorkingBudgetCheckpoint | null;
}

export interface DesignServicesExecutionResult {
  proposalId: string;
  commercialState: CommercialState;
  projectId: string;
  agreementId: string;
  billingAuthorityId: string;
  newlyExecuted: boolean;
}

export interface FurnishingsExecutionResult {
  projectId: string;
  documentId: string;
  appliedItemIds: string[];
  newlyExecuted: boolean;
}
