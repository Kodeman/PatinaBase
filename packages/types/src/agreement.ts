/**
 * Agreement vocabulary and payload contracts — "The Agreement, Composed" (Wave 1).
 *
 * Code-resident, un-CHECKed text (the `studio_contacts.contact_kind` pattern —
 * see build/contract.md §1). These are portal-facing domain shapes; database
 * rows remain generated in `@patina/supabase`, mapped into these camelCase
 * contracts at the data-access boundary.
 *
 * Frozen cross-lane interface: build/waves/w1/build-sheet.md §2.4. Backend may
 * not deviate from this text without an orchestrator ruling.
 */

export const AGREEMENT_PART_KINDS = [
  'clause', 'list', 'phases', 'schedule', 'attachment', 'attestation',
] as const;
export type AgreementPartKind = (typeof AGREEMENT_PART_KINDS)[number];

export const AGREEMENT_SCHEDULE_VARIANTS = [
  'rate_card', 'ceiling', 'retainer', 'cadence', 'flat', 'per_phase',
  'percent_of_cost', 'percent_of_spend', 'cost_plus', 'day_rate', 'package',
  'procurement', 'pricing_basis', 'draws', 'allowances',
] as const;
export type AgreementScheduleVariant = (typeof AGREEMENT_SCHEDULE_VARIANTS)[number];

export const AGREEMENT_TEMPLATE_CLASSES = [
  'design_services', 'consultation', 'furnishings_services', 'design_build',
] as const;
export type AgreementTemplateClass = (typeof AGREEMENT_TEMPLATE_CLASSES)[number];

/** R9 — the variants that create billing authority in Wave 2. Declared in W1
 *  so the composer can chip a part `creates authority` vs `record only`;
 *  nothing in W1 reads it for a projection. `procurement` is on this list only
 *  for its depositPercent field. */
export const AUTHORITY_VARIANTS = [
  'rate_card', 'ceiling', 'retainer', 'cadence', 'flat', 'per_phase',
] as const;

export interface ClausePayload { body: string }
export interface ListItem { id: string; text: string; note?: string; optional?: boolean }
export interface ListPayload { items: ListItem[] }
export interface PhasesPayload { phases: { key: string; label: string; on: boolean; feeCents?: number }[] }
/** B-9 — `effectiveAt` is the date a rate started applying, carried beside the
 *  rate through the parts door. `classify_project_time_entry_authority` filters
 *  authority rates on `effective_at <= started_at`, so a rate that loses its
 *  date stops applying to the hours it was written for. Absent means "today",
 *  which is what a rate written today means. */
export interface RateCardPayload {
  roles: {
    roleName: string;
    hourlyRateCents: number;
    sortOrder: number;
    effectiveAt?: string | null;
  }[];
}
export interface CeilingPayload { cents: number | null }
export interface RetainerPayload {
  cents: number;
  creditRule: 'credited' | 'non_refundable' | 'replenishing';
  activationPolicy: 'immediate' | 'retainer_paid';
}
export interface CadencePayload { cadence: 'monthly' | 'biweekly' | 'milestone' | 'per_draw' }
export interface FlatPayload { cents: number }
export interface PerPhasePayload { phases: { key: string; label: string; cents: number }[] }
export interface ProcurementPayload {
  depositPercent: number | null;
  markupBasis?: string; freightHandling?: string; termsOfSale?: string;
}
export interface PricingBasisPayload { basis: string; scheduleOfValues?: { label: string; cents: number }[] }
export interface DrawsPayload { draws: { label: string; percentage: number | null; cents: number }[]; retainageBps?: number }
export interface AllowancesPayload { allowances: { label: string; cents: number }[]; overageRule?: string }
export interface AttachmentPayload { title: string; body: string; jurisdiction?: string; acknowledgeRequired: boolean }
export interface AttestationPayload {
  credentialType: string; number: string; state: string;
  expiresOn: string; attestedAt: string; attestedBy: string;
}

export interface AgreementPart {
  id: string;
  proposalId: string;
  position: number;
  kind: AgreementPartKind;
  variant: AgreementScheduleVariant | null;
  partKey: string;
  title: string;
  payload: Record<string, unknown>;
  required: boolean;
  clientVisible: boolean;
  sourceTemplateKey: string | null;
  sourcePartId: string | null;
  updatedAt: string | null;
}

/** The nine standard parts, in order. `defaultTitle` is the studio-facing
 *  title; the payload defaults come from today's literals in
 *  service-agreement-drafting-room.tsx (:30-38, :48-50). */
export const PATINA_STANDARD_AGREEMENT_PARTS = [
  { partKey: 'patina.services',    kind: 'clause',   variant: null,          defaultTitle: 'Services',           required: true  },
  { partKey: 'patina.deliverables',kind: 'list',     variant: null,          defaultTitle: 'Deliverables',       required: false },
  { partKey: 'patina.exclusions',  kind: 'list',     variant: null,          defaultTitle: 'Exclusions',         required: false },
  { partKey: 'patina.role_rates',  kind: 'schedule', variant: 'rate_card',   defaultTitle: 'Role rates',         required: false },
  { partKey: 'patina.ceiling',     kind: 'schedule', variant: 'ceiling',     defaultTitle: 'Ceiling',            required: false },
  { partKey: 'patina.deposit',     kind: 'schedule', variant: 'procurement', defaultTitle: 'Furnishings deposit',required: false },
  { partKey: 'patina.retainer',    kind: 'schedule', variant: 'retainer',    defaultTitle: 'Retainer',           required: false },
  { partKey: 'patina.cadence',     kind: 'schedule', variant: 'cadence',     defaultTitle: 'Billing cadence',    required: false },
  { partKey: 'patina.terms',       kind: 'clause',   variant: null,          defaultTitle: 'Terms',              required: true  },
] as const;

export interface StudioAgreementDefaults {
  studioId: string;
  rateCard: { roleName: string; hourlyRateCents: number; sortOrder: number }[];
  depositPercent: number | null;
  cadence: 'monthly' | 'biweekly' | 'milestone';
  retainerCreditRule: 'credited' | 'non_refundable' | 'replenishing';
  defaultExclusions: string[];
  updatedBy: string | null;
  updatedAt: string | null;
}
