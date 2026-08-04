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
export type BudgetCheckpointState = 'published' | 'acknowledged' | 'overridden';

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

export interface ClientCommercialDocumentBundle {
  document: DesignServicesAgreement | FurnishingsAuthorization | CommercialDocumentSummary;
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
