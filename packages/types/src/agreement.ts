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

/** One line of the cost breakdown behind a design-build pricing basis. Under
 *  `open_book` the schedule of values is derived from these — the trades at
 *  cost, the fee as its own line. Under `closed_book` it is not: see
 *  {@link DesignBuildScheduleOfValuesLine}. */
export interface DesignBuildCostLine {
  id: string;
  label: string;
  category: 'sub' | 'general_conditions' | 'allowance';
  basisCents: number;
}

/**
 * One line of the CLIENT-FACING schedule of values (R43).
 *
 * A pro-rated schedule is invertible: one known (cost, line) pair gives the
 * multiplier, and the multiplier gives every trade's price — which is exactly
 * what RC-4 asks a closed book not to publish, and the allowance parts state
 * their amounts at cost, so one such pair is always on the page. So under
 * `closed_book` the studio AUTHORS these lines instead: they are the studio's
 * own division of the work (a room, a phase, or a single "Construction"
 * line), they sum to the contract sum to the cent, and no arithmetic over
 * them recovers a bid.
 *
 * Under `open_book` they are ignored: the trades stand at cost and the fee is
 * its own line, which is what that clause elects.
 */
export interface DesignBuildScheduleOfValuesLine {
  id: string;
  label: string;
  cents: number;
}

/** `pricing_basis` schedule payload, design-build shape (record-only, R9).
 *
 *  `basis` and `subDisclosure` are NULL until a designer chooses them. Neither
 *  has a safe default: the basis decides which figure is the contract sum, and
 *  the disclosure mode is a term the homeowner reads on the paper (R13, R21).
 *  A reader that supplied one would make readiness green over a question the
 *  send door still asks. */
export interface DesignBuildPricingBasisPayload {
  basis: PricingBasisKind | null;
  costLines: DesignBuildCostLine[];
  /** Σ `costLines[].basisCents`, stored beside the lines so
   *  `_validate_pricing_basis_payload` can assert the derivation and
   *  `_agreement_contract_sum_cents` can read a cost-plus total. Never typed:
   *  every write to this payload recomputes it from the lines. */
  costBasisCents: number;
  /** Present for `cost_plus` and `cost_plus_gmp`; absent for `fixed`. */
  feeBps: number | null;
  /** Present only for `cost_plus_gmp`. */
  gmpCents: number | null;
  /** Present only for `tm_nte`. */
  nteCents: number | null;
  /** Present only for `fixed`. */
  fixedCents: number | null;
  /**
   * R43 — the client-facing schedule of values, authored by the studio and
   * required (summing to the contract sum) whenever the disclosure is not
   * `open_book`. Empty on a draft nobody has divided up yet, and unread
   * under `open_book`.
   */
  scheduleOfValues: DesignBuildScheduleOfValuesLine[];
  subDisclosure: SubDisclosureMode | null;
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

/**
 * The supervision clause's payload. Its two figures are what the
 * no-double-count rule reads: a studio that bills supervision as a line AND
 * takes a markup on the trades is paid twice for one oversight (research 02
 * §3, §9 item 6), and `_validate_no_double_count` refuses that part set at
 * save and at send.
 */
export interface DesignBuildSupervisionPayload {
  body: string;
  supervisionFeeCents: number | null;
  supervisionFeeBps: number | null;
}

/** The sub-disclosure clause's payload — one mode per contract. The schedule
 *  of values is rendered in whichever mode this clause elects (R13), which is
 *  why an unchosen mode reads NULL rather than falling to closed-book: the
 *  mode is a term the homeowner reads, and no reader may write it for her. */
export interface DesignBuildSubDisclosurePayload {
  body: string;
  mode: SubDisclosureMode | null;
}

/**
 * The sentences the design-build class says in more than one place, declared
 * once so the composer, the readiness panel and the database cannot drift.
 * `noDoubleCount` is the message `_validate_no_double_count` returns; the
 * room prints the database's own sentence rather than a second wording of it.
 */
export const DESIGN_BUILD_COPY = {
  noDoubleCount:
    'Supervision is paid once. You have a supervision fee and a markup on the trades. Bill supervision as its own line, fold it into overhead, or take it in the trade markup — one of the three, not two.',
  noDoubleCountAside:
    'Studios that do both are, in effect, charging twice for the same oversight.',
  /** R10 — Patina stores the attestation and never checks it. */
  attestationStored: 'Patina stores this. Patina does not verify it.',
  /** R10's standing disclaimer, from research 03 §5, verbatim. Never render a
   *  word count beside it. */
  legalDisclaimer:
    'Patina helps you assemble and send agreements from parts you write and own. It is not a law firm and does not give legal advice — have an attorney review your templates before first use.',
  attestationAffirmation:
    'I attest this credential is current and covers the work in this agreement.',
  /** The one line under a design-build template a studio cannot yet use. */
  templateNeedsAttestation:
    'Add your licensing attestation in Account → Studio before using this template.',
  /** R11 — a jurisdiction notice counsel has not cleared. */
  noticeHeldForCounsel: 'Held for counsel review',
  /** R39 — the visibility act, and what it means on the paper. */
  hiddenFromClient: 'Hidden from your client',
  hiddenFromClientHelp:
    'This part stays on the agreement and off the copy your client reads.',
} as const;

/** Where a lien waiver sits in the exchange: conditional on payment or
 *  unconditional, against progress or against the final draw (P12). */
export const LIEN_WAIVER_POLICIES = [
  'conditional_then_unconditional',
  'unconditional_on_payment',
  'none',
] as const;
export type LienWaiverPolicy = (typeof LIEN_WAIVER_POLICIES)[number];

/**
 * A studio's self-attested credential (P10, R10). Patina stores it and never
 * verifies it against any registry — there is no lookup, no expiry cron, and
 * no "verified" mark anywhere in the product.
 */
export interface StudioLicenseAttestation {
  studioId: string;
  credentialType: string;
  credentialNumber: string;
  state: string;
  expiresOn: string;
  attestedBy: string | null;
  attestedAt: string | null;
}

/** A seeded jurisdiction notice (P11, R11). Every seeded row ships
 *  `enabled: false` and no studio surface can flip one. */
export interface AgreementJurisdictionNotice {
  state: string;
  kind: string;
  title: string;
  body: string;
  citation: string;
  enabled: boolean;
}

/** One recorded lien-waiver exchange against a draw (P12). `storagePath` null
 *  means the waiver was recorded but no paper was filed. */
export interface AgreementDrawLienWaiver {
  id: string;
  drawId: string;
  contactId: string | null;
  contactDisplayName: string | null;
  waiverType: LienWaiverType;
  throughDate: string | null;
  amountCents: number | null;
  storagePath: string | null;
  receivedAt: string | null;
}

/**
 * One row of the studio's own draw ledger — machine state, materialized at
 * send from the frozen `draws` payload and written thereafter only by
 * `issue_agreement_draw_invoice`. The homeowner reads a narrower projection
 * ({@link DesignBuildDrawLedgerEntry} in `./commercial`).
 */
export interface AgreementDraw {
  id: string;
  proposalId: string;
  drawKey: string;
  sortOrder: number;
  label: string;
  grossCents: number;
  retainageCents: number;
  netCents: number;
  isRetainageRelease: boolean;
  invoiceId: string | null;
  invoiceStatus: string | null;
  issuedAt: string | null;
  lienWaivers: AgreementDrawLienWaiver[];
}

export const TRADE_AGREEMENT_STATES = [
  'draft',
  'sent',
  'signed',
  'void',
] as const;
export type TradeAgreementState = (typeof TRADE_AGREEMENT_STATES)[number];

/** How a Trade Agreement's work is sequenced (research 02 §7, "Schedule"). */
export interface TradeAgreementSchedule {
  startOn: string | null;
  durationDays: number | null;
  sequencing: string | null;
}

/**
 * The subcontract (P14, R16) — studio ↔ sub, never the homeowner's paper.
 * R7: its name in every string a person reads is **Trade Agreement**; the
 * word "subcontract" is fine in code and in docs and never in the UI.
 *
 * Research 02 §7's eight essentials: scope, price (`priceCents` +
 * `sovLineIds`), schedule, retainage, pay-when-paid, insurance, lien waivers
 * — and flow-down, which is a COLUMN on the row and appears nowhere here:
 * `flow_down_clause_key` stays NULL this wave (counsel-gated, R16) and
 * `list_trade_agreements` projects it nowhere, so nothing in this shape may
 * claim to know it.
 *
 * This is exactly what `list_trade_agreements` returns, mapped. The studio's
 * own id and the row's `created_at` are likewise not in that projection — the
 * caller already knows the project it asked about, and the list is ordered by
 * creation rather than dated.
 */
export interface TradeAgreement {
  id: string;
  /** The project the caller listed. Not in the RPC's own projection. */
  projectId: string;
  sourceProposalId: string | null;
  contactId: string | null;
  contactDisplayName: string;
  contactCompanyName: string | null;
  contactEmail: string | null;
  trade: string | null;
  title: string;
  scope: string;
  priceCents: number;
  currency: string;
  schedule: TradeAgreementSchedule;
  retainageBps: number;
  payWhenPaidDays: number | null;
  insuranceCertificateRequired: boolean;
  lienWaiverPolicy: LienWaiverPolicy;
  sovLineIds: string[];
  state: TradeAgreementState;
  sentAt: string | null;
  signedAt: string | null;
  voidedAt: string | null;
  /** Whether a live signing link is outstanding on this agreement. */
  hasLiveLink: boolean;
  /** The sub's receipt, once they have signed on the token link. */
  subSignature: { signedName: string; signedAt: string } | null;
}
