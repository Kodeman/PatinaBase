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

/**
 * Wave 2 additions — "The Agreement, Composed": the Library (P4), fee
 * schedules (P5), and change history (P8). Frozen cross-lane interface:
 * build/waves/w2/build-sheet.md §2 "Cross-lane interfaces". Every export
 * above this point is Wave 1 and stays byte-identical.
 */

// ── P5 — the four new W2 schedule payloads. The other eleven variants'
// payloads (rate_card, ceiling, retainer, cadence, flat, per_phase,
// procurement, pricing_basis, draws, allowances) are declared above (W1).
// All four are record-only in W2 (R9) — no terms projection, no authority
// column, no consent fragment.

/** percent_of_cost and percent_of_spend share one editor with a basis
 *  toggle (build-sheet §4.1) — record only in W2 (R9). */
export interface PercentPayload {
  basis: 'cost' | 'spend';
  percent: number | null;
}

/** cost_plus — markup on net plus a disclosure line. Record only in W2 (R9). */
export interface CostPlusPayload {
  markupPercent: number | null;
  disclosure?: string;
}

/** day_rate — a rate plus a minimum-days floor. Record only in W2 (R9). */
export interface DayRatePayload {
  dayRateCents: number | null;
  minimumDays: number | null;
}

/** package — a named flat offering. Record only in W2 (R9). */
export interface PackagePayload {
  name: string;
  priceCents: number | null;
  includes: string[];
}

// ── P4 — the Library: `agreement_templates` + `studio_agreement_parts`.

/**
 * One entry of `agreement_templates.parts` (jsonb array). Either an inline
 * part body (how the seeded templates work) or a reference into
 * `studio_agreement_parts` by `partKey` (how a studio template composes from
 * the Library). `required` / `clientVisible`, when present on the entry,
 * override the referenced part's defaults (materialize_agreement_template,
 * build-sheet §3.2 step 4).
 */
export interface AgreementTemplatePartEntry {
  partKey?: string;
  kind: AgreementPartKind;
  variant?: AgreementScheduleVariant | null;
  title: string;
  payload: Record<string, unknown>;
  required?: boolean;
  clientVisible?: boolean;
}

/** `public.agreement_templates` (W2) — the Library's Template object (R7).
 *  `kind` here is ownership (seeded|studio) — distinct from a part's kind;
 *  see the table comment in the migration banner. */
export interface AgreementTemplate {
  id: string;
  templateKey: string;
  kind: 'seeded' | 'studio';
  studioId: string | null;
  class: AgreementTemplateClass;
  title: string;
  parts: AgreementTemplatePartEntry[];
  consentKey: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** `public.studio_agreement_parts` (W2) — the Library's Part object (R7). */
export interface StudioAgreementPart {
  id: string;
  studioId: string;
  kind: AgreementPartKind;
  variant: AgreementScheduleVariant | null;
  partKey: string;
  title: string;
  payload: Record<string, unknown>;
  requiredDefault: boolean;
  clientVisibleDefault: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── P8 — change history on parts: `agreement_part_events`.

/** `agreement_part_events.action` — code-resident vocabulary, CHECKed in SQL
 *  (the set is closed and small, unlike `AgreementPartKind`). */
export const AGREEMENT_PART_EVENT_ACTIONS = [
  'added', 'edited', 'removed', 'reordered', 'renamed', 'materialized',
] as const;
export type AgreementPartEventAction = (typeof AGREEMENT_PART_EVENT_ACTIONS)[number];

/** `public.agreement_part_events` (W2) — studio-only change history under
 *  the open part in the room. Never reaches the client bundle (R8). */
export interface AgreementPartEvent {
  id: string;
  proposalId: string;
  partId: string | null;
  partKey: string;
  action: AgreementPartEventAction;
  actor: string | null;
  actorName: string | null;
  why: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  at: string;
}

// ── P6 — the client's copy from parts: `agreement_execution_snapshots` (R12).

/** `public.agreement_execution_snapshots` (W2, R12) — the frozen HTML the
 *  client keeps at execution. No PDF, no client-side render stored, no
 *  re-render on read. `null` on the bundle until countersign.
 *
 *  R37 — three keys, because three keys are what
 *  `get_client_commercial_document_bundle` projects. `proposalId` and
 *  `partSet` were on this type and on no payload: the row's `part_set` is the
 *  studio's own record of the shapes it froze and deliberately stays behind
 *  the client edge, and the id is the document she is already reading. A type
 *  that promises fields nothing sends is a type every reader has to distrust.
 */
export interface AgreementExecutionSnapshot {
  html: string;
  documentHash: string;
  createdAt: string | null;
}

/**
 * Wave 3 additions — "The Agreement, Composed": the turnkey class (P9),
 * licensing attestation (P10), jurisdiction attachments (P11), lien waivers
 * (P12). Frozen cross-lane interface: build/waves/w3/build-sheet.md §2.6 I-1.
 * Every export above this point is Wave 1/2 and stays byte-identical.
 *
 * `PricingBasisPayload` / `DrawsPayload` / `AllowancesPayload` (declared
 * above, Wave 1) are untouched — they keep serving every class that carries
 * those variants record-only. The design-build class needs richer, more
 * specific shapes for the same three variants (research 02 §9 item 5, §3);
 * rather than widen a shared shape three other classes also use, Wave 3
 * declares the design-build-specific shapes below, grouped as
 * `DesignBuildPayloads`.
 */

/** Self-attested credential vocabulary — free text at the DB (no CHECK, the
 *  `studio_contacts.contact_kind` doctrine), code-resident here. Never
 *  verified (R10). */
export const LICENSE_CREDENTIAL_TYPES = [
  'WI Dwelling Contractor',
  'MN Residential Building Contractor',
  'CA CSLB',
  'Other',
] as const;
export type LicenseCredentialType = (typeof LICENSE_CREDENTIAL_TYPES)[number];

/** Lien waiver exchange vocabulary (P12) — free text at the DB, code-resident
 *  here (the same doctrine). */
export const LIEN_WAIVER_TYPES = [
  'conditional_progress',
  'unconditional_progress',
  'conditional_final',
  'unconditional_final',
] as const;
export type LienWaiverType = (typeof LIEN_WAIVER_TYPES)[number];

/** The four pricing bases a design-build agreement may carry (research 02 §2
 *  rows 1, 2, 4, 5 — unit price and cost-plus-fixed-fee are out this wave). */
export const PRICING_BASIS_KINDS = [
  'fixed', 'cost_plus', 'cost_plus_gmp', 'tm_nte',
] as const;
export type PricingBasisKind = (typeof PRICING_BASIS_KINDS)[number];

/** Whether the schedule of values shows the sub markup as its own line
 *  (open) or pro-rated across every line (closed) — one per contract
 *  (research 02 §9 item 5). */
export const SUB_DISCLOSURE_MODES = ['open_book', 'closed_book'] as const;
export type SubDisclosureMode = (typeof SUB_DISCLOSURE_MODES)[number];

/** One line of the cost breakdown behind a design-build pricing basis. The
 *  schedule of values is *derived* from these, never separately authored. */
export interface DesignBuildCostLine {
  id: string;
  label: string;
  category: 'sub' | 'general_conditions' | 'allowance';
  basisCents: number;
}

/** `pricing_basis` schedule payload, design-build shape (record-only, R9). */
export interface DesignBuildPricingBasisPayload {
  basis: PricingBasisKind;
  costLines: DesignBuildCostLine[];
  /** Present for `cost_plus` and `cost_plus_gmp`; absent for `fixed`. */
  feeBps: number | null;
  /** Present only for `cost_plus_gmp`. */
  gmpCents: number | null;
  /** Present only for `tm_nte`. */
  nteCents: number | null;
  /** Present only for `fixed`. */
  fixedCents: number | null;
  subDisclosure: SubDisclosureMode;
}

/** One draw of a design-build draw schedule. `key` is stable and studio-set;
 *  the first draw by `sortOrder` is the deposit and never carries retainage. */
export interface DesignBuildDraw {
  key: string;
  label: string;
  sortOrder: number;
  /** Integer percent of the contract sum, 0–100; the schedule sums to 100. */
  pct: number;
  retainageApplies: boolean;
  isRetainageRelease?: boolean;
}

/** `draws` schedule payload, design-build shape (record-only, R9). */
export interface DesignBuildDrawsPayload {
  draws: DesignBuildDraw[];
  /** 0–1000 basis points (research 02 §3: 5–10%, trending 5%). */
  retainageBps: number;
}

/** One allowance; `id` also names a `costLines` entry with
 *  `category: 'allowance'` carrying the same `basisCents` (the allowance and
 *  its schedule-of-values line are one number said twice). */
export interface DesignBuildAllowance {
  id: string;
  label: string;
  amountCents: number;
  overageRule: 'change_order' | 'client_credit';
  underageRule: 'credit' | 'retain';
}

/** `allowances` schedule payload, design-build shape (record-only, R9). */
export interface DesignBuildAllowancesPayload {
  allowances: DesignBuildAllowance[];
}

/** The design-build-specific payload shapes, grouped for the T0 cross-lane
 *  handshake (build-sheet §2.6 I-1). */
export interface DesignBuildPayloads {
  pricingBasis: DesignBuildPricingBasisPayload;
  draws: DesignBuildDrawsPayload;
  allowances: DesignBuildAllowancesPayload;
}
