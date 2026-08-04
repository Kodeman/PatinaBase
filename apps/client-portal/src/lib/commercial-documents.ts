import type { Proposal } from '@patina/supabase';
import {
  COMMERCIAL_DOCUMENT_KINDS,
  COMMERCIAL_STATES,
  type CommercialDocumentKind,
  type CommercialState,
  type CommercialDocumentSummary as CanonicalCommercialDocumentSummary,
  type CommercialSignatureReceipt,
  type DesignServiceRate,
  type DesignServiceTerms,
  type FurnishingsAuthorizationItem as CanonicalFurnishingsAuthorizationItem,
  type ProjectBillingAuthoritySummary,
  type WorkingBudgetCheckpoint as CanonicalWorkingBudgetCheckpoint,
  type WorkingBudgetLine as CanonicalWorkingBudgetLine,
  type WorkingBudgetVersion as CanonicalWorkingBudgetVersion,
} from '@patina/types';

export { COMMERCIAL_DOCUMENT_KINDS };
export const COMMERCIAL_DOCUMENT_STATES = COMMERCIAL_STATES;
export type { CommercialDocumentKind };
export type CommercialDocumentState = CommercialState;

export interface CommercialDocumentSummary extends CanonicalCommercialDocumentSummary {
  documentFingerprint: string | null;
}

export type CommercialRate = Pick<
  DesignServiceRate,
  'id' | 'version' | 'roleName' | 'hourlyRateCents' | 'effectiveAt'
>;

export type CommercialSignature = Pick<
  CommercialSignatureReceipt,
  'party' | 'signerName' | 'signedAt' | 'consentVersion' | 'documentFingerprint'
>;

export type DesignServicesTerms = Omit<
  Pick<
    DesignServiceTerms,
    | 'scope'
    | 'deliverables'
    | 'exclusions'
    | 'billingCeilingCents'
    | 'retainerAmountCents'
    | 'retainerActivationPolicy'
    | 'billingCadence'
    | 'currency'
    | 'terms'
    | 'currentRateVersion'
  >,
  'scope' | 'terms'
> & {
  scope: string | null;
  terms: string | null;
};

export type FurnishingsAuthorizationItem = Pick<
  CanonicalFurnishingsAuthorizationItem,
  'description' | 'quantity' | 'clientUnitPriceCents' | 'currency'
>;

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

export interface ProjectAuthoritySummary extends Omit<ProjectBillingAuthoritySummary, 'rates'> {
  rates: CommercialRate[];
}

export type WorkingBudgetLine = Pick<
  CanonicalWorkingBudgetLine,
  'roomName' | 'category' | 'lowCents' | 'targetCents' | 'highCents' | 'notes'
>;

export interface WorkingBudgetCheckpoint extends Pick<
  CanonicalWorkingBudgetCheckpoint,
  'id' | 'state' | 'publishedAt' | 'acknowledgedAt' | 'overrideReason'
> {
  evidenceFingerprint: string | null;
}

export interface WorkingBudgetVersion extends Pick<
  CanonicalWorkingBudgetVersion,
  | 'id'
  | 'projectId'
  | 'version'
  | 'state'
  | 'currency'
  | 'lowTotalCents'
  | 'targetTotalCents'
  | 'highTotalCents'
> {
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
 * A legacy row's projected commercial_state is normally vestigial (e.g.
 * 'draft' on a row that was actually sent) and must not override the
 * historically-governed status semantics — EXCEPT 'superseded', the one
 * terminal value the cutover RPC (supersede_unsigned_legacy_proposals)
 * writes onto a legacy row without touching its status. Trust only that
 * value; every other projected state still defers to status.
 */
function resolveLegacyState(
  projectedState: CommercialDocumentState,
  legacyState: CommercialDocumentState,
): CommercialDocumentState {
  return projectedState === 'superseded' ? 'superseded' : legacyState;
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
  const projectedState = oneOf(first(source, 'state', 'commercialState', 'commercial_state'), COMMERCIAL_DOCUMENT_STATES, legacyState);
  const state = kind === 'legacy' ? resolveLegacyState(projectedState, legacyState) : projectedState;

  return {
    id: text(first(source, 'id', 'proposalId', 'proposal_id'), proposal.id),
    projectId: nullableText(first(source, 'projectId', 'project_id')) ?? proposal.project_id,
    kind,
    state,
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
  // Project-level furnishing lists carry both the internal commercial-document
  // id and the proposal id. Client routes are proposal-addressed, so prefer the
  // latter whenever it is present.
  const id = text(first(source, 'proposalId', 'proposal_id', 'id', 'documentId', 'document_id'));
  if (!id) return null;

  const legacyStatus = oneOf(
    first(proposal, 'status') ?? first(source, 'status'),
    ['draft', 'sent', 'viewed', 'accepted', 'declined', 'expired', 'revised'] as const,
    'draft',
  );
  const inferredKind =
    first(source, 'documentId', 'document_id') !== undefined &&
    first(source, 'waveName', 'wave_name') !== undefined
      ? 'furnishings_authorization'
      : 'legacy';
  const kind = oneOf(
    first(source, 'kind', 'documentKind', 'document_kind'),
    COMMERCIAL_DOCUMENT_KINDS,
    inferredKind,
  );
  const nestedServiceTerms = record(first(raw, 'serviceTerms', 'service_terms'));
  const serviceRaw = Object.keys(nestedServiceTerms).length > 0
    ? nestedServiceTerms
    : record(first(source, 'terms'));
  const nestedFurnishings = record(first(raw, 'furnishings', 'furnishingsAuthorization', 'furnishings_authorization'));
  const furnishingRaw = Object.keys(nestedFurnishings).length > 0
    ? nestedFurnishings
    : kind === 'furnishings_authorization' ? source : {};
  const replacementRaw = record(first(raw, 'replacement'));
  const signatureRows = first(raw, 'signatures') ?? first(source, 'signatures');
  const rateRows = first(raw, 'rates') ?? first(source, 'rates');
  const depositRequiredValue = first(
    furnishingRaw,
    'depositRequiredCents',
    'deposit_required_cents',
    'depositRequired',
    'deposit_required',
  );
  const depositPaidValue = first(
    furnishingRaw,
    'depositPaidCents',
    'deposit_paid_cents',
    'depositPaid',
    'deposit_paid',
  );
  const totalAmountCents = number(
    first(source, 'totalAmountCents', 'total_amount_cents', 'totalAmount', 'total_amount') ??
      first(proposal, 'totalAmountCents', 'total_amount_cents', 'totalAmount', 'total_amount'),
  );
  const depositPercent = number(
    first(source, 'depositPercent', 'deposit_percent') ??
      first(proposal, 'depositPercent', 'deposit_percent'),
  );
  const depositRequiredCents = depositRequiredValue === undefined || depositRequiredValue === null
    ? Math.max(0, Math.round(totalAmountCents * depositPercent / 100))
    : number(depositRequiredValue);

  const legacyDerivedState = legacyStatusToCommercialState(legacyStatus);
  const projectedDocState = oneOf(
    first(source, 'state', 'commercialState', 'commercial_state'),
    COMMERCIAL_DOCUMENT_STATES,
    legacyDerivedState,
  );
  // A legacy row's projected commercial_state is vestigial and must never
  // override its historically-governed status semantics — except 'superseded'
  // (see resolveLegacyState above); this mirrors commercialSummaryFromProposal.
  const documentState = kind === 'legacy'
    ? resolveLegacyState(projectedDocState, legacyDerivedState)
    : projectedDocState;

  return {
    document: {
      id,
      projectId: nullableText(first(source, 'projectId', 'project_id')),
      kind,
      state: documentState,
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
    rates: adaptRates(rateRows),
    signatures: Array.isArray(signatureRows) ? signatureRows.flatMap((item) => {
      const row = record(item);
      const party = first(row, 'party', 'partyRole', 'party_role');
      const signerName = text(first(row, 'signerName', 'signer_name', 'signedName', 'signed_name'));
      const signedAt = text(first(row, 'signedAt', 'signed_at'));
      const documentFingerprint = text(first(
        row,
        'documentFingerprint',
        'document_fingerprint',
        'evidenceFingerprint',
        'evidence_fingerprint',
      ));
      if ((party !== 'client' && party !== 'studio') || !signerName || !signedAt || !documentFingerprint) {
        return [];
      }
      return [{
        party,
        signerName,
        signedAt,
        consentVersion: text(first(row, 'consentVersion', 'consent_version')),
        documentFingerprint,
      }];
    }) : [],
    furnishings: Object.keys(furnishingRaw).length === 0 ? null : {
      checkpointId: nullableText(first(
        furnishingRaw,
        'checkpointId',
        'checkpoint_id',
        'budgetCheckpointId',
        'budget_checkpoint_id',
      )),
      depositRequiredCents,
      depositPaidCents: number(depositPaidValue),
      items: Array.isArray(furnishingRaw.items) ? furnishingRaw.items.map((item) => {
        const row = record(item);
        return {
          description: text(first(row, 'description', 'name')),
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
  const budgetContainer = Object.keys(nestedBudget).length > 0
    ? nestedBudget
    : first(raw, 'targetTotalCents', 'target_total_cents') !== undefined ? raw : {};
  const nestedBudgetVersion = record(first(budgetContainer, 'version'));
  const budgetRaw = Object.keys(nestedBudgetVersion).length > 0
    ? nestedBudgetVersion
    : budgetContainer;
  const checkpointRaw = record(first(budgetContainer, 'checkpoint'));
  const budgetLines = first(budgetContainer, 'lines') ?? first(budgetRaw, 'lines');

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
  };

  const workingBudget: WorkingBudgetVersion | null = Object.keys(budgetRaw).length === 0 ? null : {
    id: text(budgetRaw.id),
    projectId: text(first(budgetRaw, 'projectId', 'project_id')),
    version: number(budgetRaw.version),
    state: oneOf(
      first(budgetRaw, 'state', 'status'),
      ['draft', 'published', 'superseded'] as const,
      'draft',
    ),
    currency: text(budgetRaw.currency, 'USD'),
    lowTotalCents: number(first(budgetRaw, 'lowTotalCents', 'low_total_cents')),
    targetTotalCents: number(first(budgetRaw, 'targetTotalCents', 'target_total_cents')),
    highTotalCents: number(first(budgetRaw, 'highTotalCents', 'high_total_cents')),
    lines: Array.isArray(budgetLines) ? budgetLines.map((item) => {
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
      state: first(checkpointRaw, 'state', 'status') === 'open'
        ? 'published'
        : oneOf(
          first(checkpointRaw, 'state', 'status'),
          ['published', 'acknowledged', 'overridden'] as const,
          'published',
        ),
      publishedAt: text(first(checkpointRaw, 'publishedAt', 'published_at')),
      acknowledgedAt: nullableText(first(checkpointRaw, 'acknowledgedAt', 'acknowledged_at')),
      overrideReason: nullableText(first(checkpointRaw, 'overrideReason', 'override_reason')),
      evidenceFingerprint: nullableText(first(
        checkpointRaw,
        'evidenceFingerprint',
        'evidence_fingerprint',
        'snapshotFingerprint',
        'snapshot_fingerprint',
      )),
    },
  };

  const furnishingRows = first(raw, 'furnishingsAuthorizations', 'furnishings_authorizations');
  const furnishingsAuthorizations = Array.isArray(furnishingRows)
    ? furnishingRows
      .map((item) => adaptCommercialDocumentBundle({
        ...record(item),
        projectId: first(record(item), 'projectId', 'project_id') ?? first(raw, 'projectId', 'project_id'),
      }))
      .filter((item): item is CommercialDocumentBundle => item !== null)
    : [];

  return { authority, workingBudget, furnishingsAuthorizations };
}
