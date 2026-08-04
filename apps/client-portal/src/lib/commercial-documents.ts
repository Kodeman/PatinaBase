import type { Proposal } from '@patina/supabase';

export const COMMERCIAL_DOCUMENT_KINDS = [
  'legacy',
  'design_services',
  'furnishings_authorization',
  'service_addendum',
] as const;

export type CommercialDocumentKind = (typeof COMMERCIAL_DOCUMENT_KINDS)[number];

export const COMMERCIAL_DOCUMENT_STATES = [
  'draft',
  'sent',
  'client_signed',
  'executed',
  'declined',
  'expired',
  'superseded',
] as const;

export type CommercialDocumentState = (typeof COMMERCIAL_DOCUMENT_STATES)[number];

export interface CommercialDocumentSummary {
  id: string;
  projectId: string | null;
  kind: CommercialDocumentKind;
  state: CommercialDocumentState;
  title: string;
  version: number;
  waveName: string | null;
  sentAt: string | null;
  executedAt: string | null;
  supersededAt: string | null;
  replacementProposalId: string | null;
  documentFingerprint: string | null;
}

export interface CommercialRate {
  id: string;
  version: number;
  roleName: string;
  hourlyRateCents: number;
  effectiveAt: string;
}

export interface CommercialSignature {
  party: 'client' | 'studio';
  signerName: string;
  signedAt: string;
  consentVersion: string;
  documentFingerprint: string;
}

export interface DesignServicesTerms {
  scope: string | null;
  deliverables: string[];
  exclusions: string[];
  billingCeilingCents: number;
  retainerAmountCents: number;
  retainerActivationPolicy: 'immediate' | 'retainer_paid';
  billingCadence: 'monthly' | 'biweekly' | 'milestone';
  currency: string;
  terms: string | null;
  currentRateVersion: number;
}

export interface FurnishingsAuthorizationItem {
  description: string;
  quantity: number;
  clientUnitPriceCents: number;
  currency: string;
}

export interface FurnishingsAuthorization {
  checkpointId: string | null;
  depositRequiredCents: number;
  depositPaidCents: number;
  items: FurnishingsAuthorizationItem[];
}

export interface CommercialDocumentBundle {
  document: CommercialDocumentSummary;
  serviceTerms: DesignServicesTerms | null;
  rates: CommercialRate[];
  signatures: CommercialSignature[];
  furnishings: FurnishingsAuthorization | null;
}

export interface ProjectAuthoritySummary {
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
  retainerActivationPolicy: 'immediate' | 'retainer_paid';
  activeRateVersion: number;
  billingThrough: string | null;
  rates: CommercialRate[];
  activity: Array<{ label: string; hours: number; amountCents: number }>;
}

export interface WorkingBudgetLine {
  roomName: string;
  category: string;
  lowCents: number;
  targetCents: number;
  highCents: number;
  notes: string | null;
}

export interface WorkingBudgetCheckpoint {
  id: string;
  state: 'published' | 'acknowledged' | 'overridden';
  publishedAt: string;
  acknowledgedAt: string | null;
  overrideReason: string | null;
  evidenceFingerprint: string | null;
}

export interface WorkingBudgetVersion {
  id: string;
  projectId: string;
  version: number;
  state: string;
  currency: string;
  lowTotalCents: number;
  targetTotalCents: number;
  highTotalCents: number;
  lines: WorkingBudgetLine[];
  checkpoint: WorkingBudgetCheckpoint | null;
}

export interface ProjectCommercialSummary {
  authority: ProjectAuthoritySummary | null;
  workingBudget: WorkingBudgetVersion | null;
  furnishingsAuthorizations: CommercialDocumentBundle[];
}

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function first(source: UnknownRecord, ...keys: string[]): unknown {
  for (const key of keys) {
    if (source[key] !== undefined) return source[key];
  }
  return undefined;
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function nullableText(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function number(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function oneOf<T extends string>(value: unknown, values: readonly T[], fallback: T): T {
  return typeof value === 'string' && (values as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

export function legacyStatusToCommercialState(status: Proposal['status']): CommercialDocumentState {
  switch (status) {
    case 'sent':
    case 'viewed':
      return 'sent';
    case 'accepted':
      return 'executed';
    case 'declined':
      return 'declined';
    case 'expired':
      return 'expired';
    case 'revised':
      return 'superseded';
    default:
      return 'draft';
  }
}

/**
 * Adapts the additive commercial fields returned by list_client_proposals.
 * Legacy rows remain first-class and keep their historical status semantics.
 */
export function commercialSummaryFromProposal(proposal: Proposal): CommercialDocumentSummary {
  const raw = record(proposal);
  const nested = record(first(raw, 'document', 'commercialDocument', 'commercial_document'));
  const source = Object.keys(nested).length > 0 ? nested : raw;
  const kind = oneOf(first(source, 'kind', 'documentKind', 'document_kind'), COMMERCIAL_DOCUMENT_KINDS, 'legacy');
  const legacyState = legacyStatusToCommercialState(proposal.status);

  return {
    id: text(first(source, 'id', 'proposalId', 'proposal_id'), proposal.id),
    projectId: nullableText(first(source, 'projectId', 'project_id')) ?? proposal.project_id,
    kind,
    state: oneOf(first(source, 'state', 'commercialState', 'commercial_state'), COMMERCIAL_DOCUMENT_STATES, legacyState),
    title: text(first(source, 'title'), proposal.title),
    version: number(first(source, 'version'), proposal.version ?? 1),
    waveName: nullableText(first(source, 'waveName', 'wave_name')),
    sentAt: nullableText(first(source, 'sentAt', 'sent_at')) ?? proposal.sent_at,
    executedAt: nullableText(first(source, 'executedAt', 'executed_at', 'signedAt', 'signed_at')),
    supersededAt: nullableText(first(source, 'supersededAt', 'superseded_at')),
    replacementProposalId: nullableText(first(source, 'replacementProposalId', 'replacement_proposal_id')),
    documentFingerprint: nullableText(first(source, 'documentFingerprint', 'document_fingerprint', 'evidenceFingerprint', 'evidence_fingerprint')),
  };
}

function adaptRates(value: unknown): CommercialRate[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = record(item);
    return {
      id: text(first(row, 'id')),
      version: number(first(row, 'version')),
      roleName: text(first(row, 'roleName', 'role_name')),
      hourlyRateCents: number(first(row, 'hourlyRateCents', 'hourly_rate_cents')),
      effectiveAt: text(first(row, 'effectiveAt', 'effective_at')),
    };
  });
}

/** Maps the database-owned allowlist bundle and intentionally discards every unknown key. */
export function adaptCommercialDocumentBundle(value: unknown): CommercialDocumentBundle | null {
  const raw = record(value);
  const proposal = record(raw.proposal);
  const documentRaw = record(first(raw, 'document', 'commercialDocument', 'commercial_document'));
  const source = Object.keys(documentRaw).length > 0
    ? documentRaw
    : Object.keys(proposal).length > 0 ? proposal : raw;
  const id = text(first(source, 'id', 'proposalId', 'proposal_id'));
  if (!id) return null;

  const legacyStatus = oneOf(
    proposal.status,
    ['draft', 'sent', 'viewed', 'accepted', 'declined', 'expired', 'revised'] as const,
    'draft',
  );
  const kind = oneOf(first(source, 'kind', 'documentKind', 'document_kind'), COMMERCIAL_DOCUMENT_KINDS, 'legacy');
  const serviceRaw = record(first(raw, 'serviceTerms', 'service_terms'));
  const nestedFurnishings = record(first(raw, 'furnishings', 'furnishingsAuthorization', 'furnishings_authorization'));
  const furnishingRaw = Object.keys(nestedFurnishings).length > 0
    ? nestedFurnishings
    : kind === 'furnishings_authorization' ? raw : {};
  const replacementRaw = record(first(raw, 'replacement'));
  const signatureRows = first(raw, 'signatures');

  return {
    document: {
      id,
      projectId: nullableText(first(source, 'projectId', 'project_id')),
      kind,
      state: oneOf(
        first(source, 'state', 'commercialState', 'commercial_state'),
        COMMERCIAL_DOCUMENT_STATES,
        legacyStatusToCommercialState(legacyStatus),
      ),
      title: text(first(source, 'title'), text(proposal.title, 'Commercial document')),
      version: number(first(source, 'version'), 1),
      waveName: nullableText(first(source, 'waveName', 'wave_name')),
      sentAt: nullableText(first(source, 'sentAt', 'sent_at')),
      executedAt: nullableText(first(source, 'executedAt', 'executed_at')),
      supersededAt: nullableText(first(source, 'supersededAt', 'superseded_at')),
      replacementProposalId:
        nullableText(first(source, 'replacementProposalId', 'replacement_proposal_id')) ??
        nullableText(first(replacementRaw, 'proposalId', 'proposal_id', 'id')),
      documentFingerprint: nullableText(first(source, 'documentFingerprint', 'document_fingerprint', 'evidenceFingerprint', 'evidence_fingerprint')),
    },
    serviceTerms: Object.keys(serviceRaw).length === 0 ? null : {
      scope: nullableText(first(serviceRaw, 'scope')),
      deliverables: strings(first(serviceRaw, 'deliverables')),
      exclusions: strings(first(serviceRaw, 'exclusions')),
      billingCeilingCents: number(first(serviceRaw, 'billingCeilingCents', 'billing_ceiling_cents')),
      retainerAmountCents: number(first(serviceRaw, 'retainerAmountCents', 'retainer_amount_cents')),
      retainerActivationPolicy: oneOf(first(serviceRaw, 'retainerActivationPolicy', 'retainer_activation_policy'), ['immediate', 'retainer_paid'] as const, 'immediate'),
      billingCadence: oneOf(first(serviceRaw, 'billingCadence', 'billing_cadence'), ['monthly', 'biweekly', 'milestone'] as const, 'monthly'),
      currency: text(first(serviceRaw, 'currency'), 'USD'),
      terms: nullableText(first(serviceRaw, 'terms')),
      currentRateVersion: number(first(serviceRaw, 'currentRateVersion', 'current_rate_version'), 1),
    },
    rates: adaptRates(first(raw, 'rates')),
    signatures: Array.isArray(signatureRows) ? signatureRows.map((item) => {
      const row = record(item);
      return {
        party: oneOf(first(row, 'party'), ['client', 'studio'] as const, 'client'),
        signerName: text(first(row, 'signerName', 'signer_name')),
        signedAt: text(first(row, 'signedAt', 'signed_at')),
        consentVersion: text(first(row, 'consentVersion', 'consent_version')),
        documentFingerprint: text(first(row, 'documentFingerprint', 'document_fingerprint')),
      };
    }) : [],
    furnishings: Object.keys(furnishingRaw).length === 0 ? null : {
      checkpointId: nullableText(first(furnishingRaw, 'checkpointId', 'checkpoint_id')),
      depositRequiredCents: number(first(furnishingRaw, 'depositRequiredCents', 'deposit_required_cents')),
      depositPaidCents: number(first(furnishingRaw, 'depositPaidCents', 'deposit_paid_cents')),
      items: Array.isArray(furnishingRaw.items) ? furnishingRaw.items.map((item) => {
        const row = record(item);
        return {
          description: text(first(row, 'description')),
          quantity: number(first(row, 'quantity')),
          clientUnitPriceCents: number(first(row, 'clientUnitPriceCents', 'client_unit_price_cents')),
          currency: text(first(row, 'currency'), 'USD'),
        };
      }) : [],
    },
  };
}

export function adaptProjectCommercialSummary(value: unknown): ProjectCommercialSummary {
  const raw = record(value);
  const nestedAuthority = record(first(raw, 'authority', 'authoritySummary', 'authority_summary'));
  const nestedBudget = record(first(raw, 'workingBudget', 'working_budget', 'budget'));
  const authorityRaw = Object.keys(nestedAuthority).length > 0
    ? nestedAuthority
    : first(raw, 'agreementId', 'agreement_id') !== undefined ? raw : {};
  const budgetRaw = Object.keys(nestedBudget).length > 0
    ? nestedBudget
    : first(raw, 'targetTotalCents', 'target_total_cents') !== undefined ? raw : {};
  const checkpointRaw = record(first(budgetRaw, 'checkpoint'));

  const authority: ProjectAuthoritySummary | null = Object.keys(authorityRaw).length === 0 ? null : {
    id: text(authorityRaw.id),
    projectId: text(first(authorityRaw, 'projectId', 'project_id')),
    agreementId: text(first(authorityRaw, 'agreementId', 'agreement_id')),
    state: oneOf(authorityRaw.state, ['active', 'retainer_pending', 'exhausted', 'superseded'] as const, 'active'),
    currency: text(authorityRaw.currency, 'USD'),
    ceilingCents: number(first(authorityRaw, 'ceilingCents', 'ceiling_cents')),
    authorizedCents: number(first(authorityRaw, 'authorizedCents', 'authorized_cents')),
    accruedCents: number(first(authorityRaw, 'accruedCents', 'accrued_cents')),
    invoicedCents: number(first(authorityRaw, 'invoicedCents', 'invoiced_cents')),
    pendingAuthorizationCents: number(first(authorityRaw, 'pendingAuthorizationCents', 'pending_authorization_cents')),
    remainingCents: number(first(authorityRaw, 'remainingCents', 'remaining_cents')),
    retainerAmountCents: number(first(authorityRaw, 'retainerAmountCents', 'retainer_amount_cents')),
    retainerPaidCents: number(first(authorityRaw, 'retainerPaidCents', 'retainer_paid_cents')),
    retainerActivationPolicy: oneOf(first(authorityRaw, 'retainerActivationPolicy', 'retainer_activation_policy'), ['immediate', 'retainer_paid'] as const, 'immediate'),
    activeRateVersion: number(first(authorityRaw, 'activeRateVersion', 'active_rate_version')),
    billingThrough: nullableText(first(authorityRaw, 'billingThrough', 'billing_through')),
    rates: adaptRates(authorityRaw.rates),
    activity: Array.isArray(authorityRaw.activity) ? authorityRaw.activity.map((item) => {
      const row = record(item);
      return {
        label: text(row.label),
        hours: number(row.hours),
        amountCents: number(first(row, 'amountCents', 'amount_cents')),
      };
    }) : [],
  };

  const workingBudget: WorkingBudgetVersion | null = Object.keys(budgetRaw).length === 0 ? null : {
    id: text(budgetRaw.id),
    projectId: text(first(budgetRaw, 'projectId', 'project_id')),
    version: number(budgetRaw.version),
    state: text(budgetRaw.state),
    currency: text(budgetRaw.currency, 'USD'),
    lowTotalCents: number(first(budgetRaw, 'lowTotalCents', 'low_total_cents')),
    targetTotalCents: number(first(budgetRaw, 'targetTotalCents', 'target_total_cents')),
    highTotalCents: number(first(budgetRaw, 'highTotalCents', 'high_total_cents')),
    lines: Array.isArray(budgetRaw.lines) ? budgetRaw.lines.map((item) => {
      const row = record(item);
      return {
        roomName: text(first(row, 'roomName', 'room_name')),
        category: text(row.category),
        lowCents: number(first(row, 'lowCents', 'low_cents')),
        targetCents: number(first(row, 'targetCents', 'target_cents')),
        highCents: number(first(row, 'highCents', 'high_cents')),
        notes: nullableText(row.notes),
      };
    }) : [],
    checkpoint: Object.keys(checkpointRaw).length === 0 ? null : {
      id: text(checkpointRaw.id),
      state: oneOf(checkpointRaw.state, ['published', 'acknowledged', 'overridden'] as const, 'published'),
      publishedAt: text(first(checkpointRaw, 'publishedAt', 'published_at')),
      acknowledgedAt: nullableText(first(checkpointRaw, 'acknowledgedAt', 'acknowledged_at')),
      overrideReason: nullableText(first(checkpointRaw, 'overrideReason', 'override_reason')),
      evidenceFingerprint: nullableText(first(checkpointRaw, 'evidenceFingerprint', 'evidence_fingerprint')),
    },
  };

  const furnishingRows = first(raw, 'furnishingsAuthorizations', 'furnishings_authorizations');
  const furnishingsAuthorizations = Array.isArray(furnishingRows)
    ? furnishingRows.map(adaptCommercialDocumentBundle).filter((item): item is CommercialDocumentBundle => item !== null)
    : [];

  return { authority, workingBudget, furnishingsAuthorizations };
}
