/**
 * Commercial document and authority contracts.
 *
 * These are portal-facing domain shapes. Database rows remain generated in
 * `@patina/supabase`; callers should map snake_case rows into these camelCase
 * contracts at the data-access boundary.
 */

import type {
  DesignBuildPricingBasisPayload,
  DesignBuildScheduleOfValuesLine,
  LienWaiverType,
} from './agreement';
import type { FfeLineUnit } from './ffe';

export const COMMERCIAL_DOCUMENT_KINDS = [
  'legacy',
  'design_services',
  'furnishings_authorization',
  'service_addendum',
  'trade_scope',
  'design_build',
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
  /** NULL = uncapped. Legal only when the agreement carries no rate_card
   *  part (00575 `_agreement_requires_rate_card`); the seven-facet room
   *  never writes null. */
  billingCeilingCents: number | null;
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

export interface DesignServiceRate {
  id: string;
  proposalId: string;
  version: number;
  roleName: string;
  hourlyRateCents: number;
  effectiveAt: string | null;
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
  /** NULL = uncapped (F-2) — legal only when the agreement carries no
   *  rate_card part. Render as "No ceiling", never as `$0`. */
  ceilingCents: number | null;
  /** NULL = uncapped (F-2), mirrors `ceilingCents` — the RPC returns the same
   *  `billing_ceiling_cents` for both. Render as "No ceiling", never as `$0`. */
  authorizedCents: number | null;
  accruedCents: number;
  invoicedCents: number;
  pendingAuthorizationCents: number;
  /** NULL = uncapped (F-2), mirrors `ceilingCents`. */
  remainingCents: number | null;
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
  /** The unit the line prices by (00744 snapshot); 'each' when absent (W4). */
  unit?: FfeLineUnit;
  /** Every room the line is placed in, from the frozen snapshot (00744, W4). */
  rooms?: Array<{ name: string; quantity: number; unit: FfeLineUnit }>;
}

/** Frozen reference only: the remote host may later change the pixels. */
export interface AuthorizationClientImage {
  version: 1;
  url: string | null;
}

/** Shared trust-boundary decoder; absent/unknown versions stay legacy image-less. */
export function authorizationClientImage(value: unknown): AuthorizationClientImage | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const image = value as Record<string, unknown>;
  if (image.version !== 1) return undefined;
  return { version: 1, url: safeAuthorizationImageUrl(image.url) };
}

function safeAuthorizationImageUrl(value: unknown): string | null {
  if (typeof value !== 'string' || /[\s\\%]/.test(value)) return null;
  try {
    const url = new URL(value);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) return null;
    if (url.username || url.password || url.hash || !url.hostname) return null;
    if (/\/storage\/v1\/object\/(sign|authenticated)\//i.test(decodeURIComponent(url.pathname))) return null;
    for (const key of url.searchParams.keys()) {
      if (/^(x-amz-.+|x-goog-.+|awsaccesskeyid|signature|sig|token|expires?|expiry|policy|key-pair-id|se|sp|sv|st|sas)$/i.test(key)) return null;
    }
    return value;
  } catch { return null; }
}

export interface AuthorizationLeadTime {
  version: 1;
  weeks: number | null;
}

function isAuthorizationLeadTimeWeeks(value: unknown): value is number | null {
  return value === null || (Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 104);
}

/** Only the frozen, versioned client projection crosses this boundary. */
export function authorizationLeadTime(raw: unknown): AuthorizationLeadTime | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const leadTime = raw as Record<string, unknown>;
  if (leadTime.version !== 1 || !isAuthorizationLeadTimeWeeks(leadTime.weeks)) return undefined;
  return { version: 1, weeks: leadTime.weeks };
}

export function formatLeadTimeWeeks(weeks: number | null): string {
  if (weeks === null) return 'Lead time to be confirmed';
  if (weeks === 0) return 'In stock';
  return weeks === 1 ? 'About 1 week' : 'About ' + weeks + ' weeks';
}

export type ClientFurnishingsAuthorizationItem = Pick<
  FurnishingsAuthorizationItem,
  'description' | 'quantity' | 'clientUnitPriceCents' | 'currency' | 'unit' | 'rooms'
> & {
  /**
   * The room the line files under. The RPC has always projected it
   * (`furnishing_authorization_items.room_name`); the portal was throwing it
   * away, which is why the client's authorization read as one flat list of
   * furniture with no idea which room anything went in.
   */
  roomName: string;
  clientImage?: AuthorizationClientImage;
  leadTime?: AuthorizationLeadTime;
  /**
   * The authoritative per-line figure — NOT `quantity × clientUnitPriceCents`.
   * An allowance is snapshotted at its ceiling and the unit price is that
   * ceiling divided by quantity with integer truncation, so the product can
   * fall up to (quantity − 1) cents short of what the client actually signed
   * for. Σ clientLineTotalCents reconciles exactly to the document's
   * totalAmountCents; the product does not.
   */
  clientLineTotalCents: number;
  /**
   * An allowance line (the RPC's `itemType`): its line total is a ceiling, so
   * it prints as `Up to $X` (US-21 T-55b, F8). Absent on a legacy payload.
   */
  allowance?: boolean;
};


export interface FurnishingsAuthorizationBodyData {
  items: ClientFurnishingsAuthorizationItem[];
  totalAmountCents: number;
  depositPercent: number;
}

export interface FurnishingsAuthorizationPreview {
  proposalId: string;
  projectId: string;
  title: string;
  state: CommercialState;
  documentFingerprint: string;
  body: FurnishingsAuthorizationBodyData;
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

/**
 * Wave 3 — the turnkey class (P9). Frozen cross-lane interface:
 * build/waves/w3/build-sheet.md §2.6 I-1.
 */

/** One line of the schedule of values the homeowner reads — the studio's own
 *  authored lines when the sub-disclosure clause reads `closed_book` (R43),
 *  the trades at cost plus their own fee line when `open_book`. Declared once,
 *  beside the payload it lives on. */
export type { DesignBuildScheduleOfValuesLine } from './agreement';

/** One row of the client's draw ledger — mirrors {@link TradeScopeDraw}'s
 *  rendered-ledger shape, not the authored `draws` payload
 *  ({@link DesignBuildDrawsPayload} in `./agreement`). `lienWaiver` is `null`
 *  until a waiver is recorded against the draw (P12). */
export interface DesignBuildDrawLedgerEntry {
  drawKey: string;
  label: string;
  grossCents: number;
  retainageCents: number;
  netCents: number;
  isRetainageRelease: boolean;
  invoiceStatus: string | null;
  paidAt: string | null;
  lienWaiver: { type: LienWaiverType; receivedAt: string } | null;
}

/** One allowance as the client reads it (id/amount only — the overage/
 *  underage rules are prose the studio already wrote into the clause). */
export interface DesignBuildAllowanceLine {
  id: string;
  label: string;
  amountCents: number;
  overageRule: 'change_order' | 'client_credit';
  underageRule: 'credit' | 'retain';
}

/** One attachment leaf (jurisdiction notice or lien-waiver form). A disabled
 *  notice (R11) never reaches this array — enforced at send (backend PART 11). */
export interface DesignBuildAttachment {
  title: string;
  body: string;
  jurisdiction: string | null;
  acknowledgeRequired: boolean;
}

export interface DesignBuildAgreement extends CommercialDocumentSummary {
  kind: 'design_build';
  projectId: string;
  pricingBasis: DesignBuildPricingBasisPayload;
  scheduleOfValues: DesignBuildScheduleOfValuesLine[];
  draws: DesignBuildDrawLedgerEntry[];
  allowances: DesignBuildAllowanceLine[];
  attachments: DesignBuildAttachment[];
  signatures: CommercialSignatureReceipt[];
}

export interface ClientCommercialDocumentBundle {
  document:
    | DesignServicesAgreement
    | FurnishingsAuthorization
    | TradeScopeAuthorization
    | DesignBuildAgreement
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
