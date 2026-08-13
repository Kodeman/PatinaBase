// Pure helpers for the po-send edge function (Wave 4, W4-T3).
//
// Everything here is dependency-free and side-effect-free so it unit-tests
// under plain `deno test` without booting Deno.serve (index.ts imports this
// module; index.test.ts tests it directly).

// ─── Payload parsing ─────────────────────────────────────────────────────────

export type PoSendMode = 'preview' | 'send' | 'mark_sent';

export const PO_NEEDS_REPRICING_DETAIL =
  'This purchase order must be repriced before it can be sent or marked sent.';

export type PoRepricingGate =
  | { ok: true; needsRepricing: boolean }
  | { ok: false; error: 'invalid_po_state' | 'po_needs_repricing'; detail: string };

/** Block release modes while keeping preview available for diagnosis. */
export function checkPoRepricingGate(value: unknown, mode: PoSendMode): PoRepricingGate {
  if (
    !value ||
    typeof value !== 'object' ||
    typeof (value as Record<string, unknown>).needs_repricing !== 'boolean'
  ) {
    return {
      ok: false,
      error: 'invalid_po_state',
      detail: 'Purchase order repricing state is unavailable.',
    };
  }
  const needsRepricing = (value as { needs_repricing: boolean }).needs_repricing;
  if (needsRepricing && (mode === 'send' || mode === 'mark_sent')) {
    return { ok: false, error: 'po_needs_repricing', detail: PO_NEEDS_REPRICING_DETAIL };
  }
  return { ok: true, needsRepricing };
}

export interface PoSendPayload {
  purchaseOrderId: string;
  mode: PoSendMode;
  recipientEmail?: string;
  message?: string;
  ccDesigner: boolean;
}

const VALID_MODES: ReadonlySet<string> = new Set(['preview', 'send', 'mark_sent']);

export type ParseResult =
  | { ok: true; payload: PoSendPayload }
  | { ok: false; error: string };

/**
 * Validate the request body. Error strings double as the response `error`
 * codes (invoice-send idiom): 'invalid_body', 'purchaseOrderId_required',
 * 'invalid_mode', 'invalid_recipient'. `mode` defaults to 'send'.
 */
export function parsePoSendBody(body: unknown): ParseResult {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, error: 'invalid_body' };
  }
  const b = body as Record<string, unknown>;

  const purchaseOrderId =
    typeof b.purchaseOrderId === 'string' ? b.purchaseOrderId.trim() : '';
  if (!purchaseOrderId) {
    return { ok: false, error: 'purchaseOrderId_required' };
  }

  let mode: PoSendMode = 'send';
  if (b.mode !== undefined && b.mode !== null) {
    if (typeof b.mode !== 'string' || !VALID_MODES.has(b.mode)) {
      return { ok: false, error: 'invalid_mode' };
    }
    mode = b.mode as PoSendMode;
  }

  let recipientEmail: string | undefined;
  if (b.recipientEmail !== undefined && b.recipientEmail !== null) {
    const candidate =
      typeof b.recipientEmail === 'string' ? b.recipientEmail.trim() : '';
    if (!candidate || !candidate.includes('@')) {
      return { ok: false, error: 'invalid_recipient' };
    }
    recipientEmail = candidate;
  }

  const message =
    typeof b.message === 'string' && b.message.trim() ? b.message.trim() : undefined;

  return {
    ok: true,
    payload: {
      purchaseOrderId,
      mode,
      recipientEmail,
      message,
      ccDesigner: b.ccDesigner === true,
    },
  };
}

// ─── Recipient resolution ────────────────────────────────────────────────────

export interface VendorRecipientSource {
  orders_email?: string | null;
  contact_info?: Record<string, unknown> | null;
}

/**
 * Resolve the vendor recipient via the 00188 fallback chain:
 * explicit override → vendors.orders_email → contact_info->>'email'.
 * Blank/whitespace values fall through; returns null when nothing usable.
 */
export function resolveVendorRecipient(
  vendor: VendorRecipientSource | null | undefined,
  override?: string | null,
): string | null {
  const overrideEmail = override?.trim();
  if (overrideEmail) return overrideEmail;

  const ordersEmail = vendor?.orders_email?.trim();
  if (ordersEmail) return ordersEmail;

  const contactEmail = vendor?.contact_info?.email;
  if (typeof contactEmail === 'string' && contactEmail.trim()) {
    return contactEmail.trim();
  }

  return null;
}

// ─── Sidemark fallback ───────────────────────────────────────────────────────
//
// Server-side port of the Order Assistant's client-side sidemark generator
// in the designer portal (grep `buildSidemark`, W3-T3b):
// `{STUDIO≤3}-{CLIENT-or-PROJECT≤8}`, uppercase,
// non-alphanumerics stripped, empty segments omitted. The room segment is
// intentionally dropped server-side — a PO can span rooms.

function words(input: string): string[] {
  return input.split(/[^A-Za-z0-9]+/).filter(Boolean);
}

function initialsOrPrefix(input: string | null | undefined, max: number): string {
  if (!input) return '';
  const ws = words(input);
  if (ws.length === 0) return '';
  if (ws.length >= 2) {
    return ws
      .slice(0, max)
      .map((w) => w[0])
      .join('')
      .toUpperCase();
  }
  return ws[0].slice(0, max).toUpperCase();
}

function compactName(input: string | null | undefined, max: number): string {
  if (!input) return '';
  return input.replace(/[^A-Za-z0-9]+/g, '').slice(0, max).toUpperCase();
}

export interface FallbackSidemarkParts {
  studioName?: string | null;
  clientName?: string | null;
  projectName?: string | null;
}

/** Generate the fallback sidemark; '' when no segment has usable input. */
export function buildFallbackSidemark(parts: FallbackSidemarkParts): string {
  const studio = initialsOrPrefix(parts.studioName, 3);
  const middle =
    compactName(parts.clientName, 8) || compactName(parts.projectName, 8);
  return [studio, middle].filter(Boolean).join('-');
}

// ─── Send-time consistency guard (W4-T4) ─────────────────────────────────────
//
// Pre-00186 purchase orders were created with CLIENT-price total_cents, and
// their po_payments schedule was derived from that number. The PO document's
// line table prints TRADE prices, so emailing such a PO would pair a payment
// schedule with a line total it doesn't sum to — an incoherent vendor document
// that indirectly discloses the designer's markup (deposit amounts leak client
// pricing). Item re-pricing after creation drifts the same way. The index
// handler refuses mode 'send' when the sums disagree (422 po_out_of_sync);
// 'preview' (flagged via `warnings`) and 'mark_sent' stay allowed so the
// designer can still inspect the document / record an outside-Patina order.

export interface PoTotalsCoherence {
  poTotalCents: number;
  tradeTotalCents: number;
  paymentsTotalCents: number;
  coherent: boolean;
}

/**
 * Verify the three totals a sendable PO must agree on:
 *
 *   Σ line trade totals (COALESCE(trade, unit, 0) × qty — the sum the PDF
 *   prints)  ===  purchase_orders.total_cents  ===  Σ po_payments.amount_cents
 *
 * Post-00186 POs always cohere (the create RPC derives total_cents and the
 * payment schedule from the trade total). Incoherence flags a pre-00186
 * client-price PO, or one whose linked items were re-priced after creation —
 * equally incoherent to send.
 */
export function checkPoTotalsCoherence(
  poTotalCents: number,
  payments: Array<{ amount_cents: number }>,
  items: Array<{
    trade_price_cents?: number | null;
    unit_price_cents?: number | null;
    quantity?: number | null;
  }>,
): PoTotalsCoherence {
  const paymentsTotalCents = payments.reduce((sum, p) => sum + p.amount_cents, 0);
  const tradeTotalCents = items.reduce(
    (sum, item) =>
      sum +
      (item.trade_price_cents ?? item.unit_price_cents ?? 0) * (item.quantity ?? 1),
    0,
  );
  return {
    poTotalCents,
    tradeTotalCents,
    paymentsTotalCents,
    coherent: tradeTotalCents === poTotalCents && paymentsTotalCents === poTotalCents,
  };
}

/**
 * Human message for the po_out_of_sync 422 — rendered VERBATIM by the portal
 * (poSendErrorMessage in po-send-actions.tsx duplicates this string; keep
 * them in lockstep).
 */
export const PO_OUT_OF_SYNC_DETAIL =
  "This PO's payment schedule no longer matches its item pricing — item prices " +
  'may have changed since creation, or the PO predates trade-cost totals. ' +
  'Recreate the PO or mark it sent manually.';

// ─── Display labels ──────────────────────────────────────────────────────────

/** Human label for a purchase_orders.payment_pattern value. */
export function paymentPatternLabel(pattern: string): string {
  switch (pattern) {
    case 'fifty_fifty':
      return '50% deposit, 50% balance';
    case 'thirty_seventy':
      return '30% deposit, 70% balance';
    case 'full_upfront':
      return '100% up front';
    case 'net_30':
      return 'Net 30';
    case 'custom_milestones':
      return 'Custom milestones';
    default:
      return pattern;
  }
}

/** Human label for a po_payments row: explicit label, else capitalized kind. */
export function paymentRowLabel(payment: {
  kind: string;
  label?: string | null;
}): string {
  const explicit = payment.label?.trim();
  if (explicit) return explicit;
  const kind = payment.kind || 'payment';
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

// ─── Schedule proposal (R109 — a fact proposes, it never writes) ─────────────

export interface SchedulePoProposalInput {
  projectId: string | null | undefined;
  purchaseOrderId: string;
  /** First thread-lane phase of the project, or null when there is none. */
  targetPhaseId: string | null | undefined;
  /** ISO timestamp of the first-send stamp. */
  sentAt: string;
}

export interface SchedulePoProposalRow {
  project_id: string;
  source_event: 'po-sent';
  source_ref: string;
  target_phase_id: string | null;
  proposed_anchor_date: string;
  disclosed_context: Record<string, unknown> | null;
}

export const PO_SENT_NO_THREAD_PHASE_NOTE =
  'No thread-lane phase on this project — the proposal is filed against the project.';

/**
 * Build the schedule_proposals row a first send records. Returns null when the
 * purchase order carries no project, so there is nothing to propose against.
 * The edge function runs as service_role, which the migration deliberately
 * leaves with zero EXECUTE on _commit_schedule_edit_authorized — a fact can
 * only ever land here.
 */
export function buildSchedulePoProposal(
  input: SchedulePoProposalInput,
): SchedulePoProposalRow | null {
  const projectId = input.projectId?.trim();
  if (!projectId) return null;
  const anchorDate = input.sentAt.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchorDate)) return null;
  const targetPhaseId = input.targetPhaseId?.trim() || null;
  return {
    project_id: projectId,
    source_event: 'po-sent',
    source_ref: input.purchaseOrderId,
    target_phase_id: targetPhaseId,
    proposed_anchor_date: anchorDate,
    disclosed_context: targetPhaseId ? null : { note: PO_SENT_NO_THREAD_PHASE_NOTE },
  };
}

// ─── Vendor-safe spec notes ──────────────────────────────────────────────────

/**
 * Strip internal-only lines from project_ffe_items.notes before printing
 * them on a vendor-facing document. Proposal activation appends the
 * designer's internal_notes with an "Internal: " prefix (see
 * activate_proposal_as_project carry table) — those must never reach the
 * vendor. Returns null when nothing vendor-safe remains.
 */
export function vendorSafeSpecNotes(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const kept = notes
    .split('\n')
    .filter((line) => !/^\s*internal:/i.test(line))
    .join('\n')
    .trim();
  return kept || null;
}

// ─── Vendor configuration spec block (P0-1) ──────────────────────────────────
//
// Until now the PO said "Bed" where the designer had specified "Bed — Walnut,
// Brass, King". Every configured line already carries a locked, hash-verified
// `project_ffe_specs.configuration_snapshot` by the time the item is linked to
// a PO (00403's lock trigger enforces it), so the document can finally print
// what was actually ordered.
//
// AUDIENCE RULE — this is a VENDOR document. It prints selections, components,
// dimensions, COM instructions and the config hash. It NEVER prints
// retailPriceCents, any markup/margin, or the studio-only "Commercial:" line
// that formatConfigurationSnapshotForClipboard(…, 'studio') emits in the
// portal. The trade line amounts already on the PO are the only money here.
//
// The portal has the same audience rule in
// apps/designer-portal/src/components/document/rooms/piece/custom-commission-model.ts
// (`formatConfigurationSnapshotForClipboard`). Edge functions cannot import
// from apps/, so the rule is deliberately duplicated; the shared JSON fixture
// ./fixtures/configuration-snapshot.fixture.json is the contract both sides
// assert against.

/**
 * The `spec:project_ffe_specs!…(…)` embed shape, tolerant of camelCase and
 * snake_case (PostgREST returns snake_case; the portal's camel envelope
 * reaches this helper in tests and future callers).
 */
export interface VendorConfigurationSpec {
  configuration_id?: string | null;
  configurationId?: string | null;
  configuration_snapshot?: unknown;
  configurationSnapshot?: unknown;
  snapshot?: unknown;
  configuration_snapshot_hash?: string | null;
  configurationSnapshotHash?: string | null;
  snapshotHash?: string | null;
  configuration_locked_at?: string | null;
  configurationLockedAt?: string | null;
  sku?: string | null;
  material?: string | null;
  finish?: string | null;
  color_fabric?: string | null;
  colorFabric?: string | null;
  selected_dimensions?: unknown;
  selectedDimensions?: unknown;
}

function readRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function readArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is Record<string, unknown> =>
      !!entry && typeof entry === 'object' && !Array.isArray(entry),
  );
}

/** Trimmed string from a string|number cell; null for anything else/blank. */
function readScalar(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function readCount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

// Dimension keys this PDF is willing to print. `dimensions` / `selected_dimensions`
// are wide-open jsonb — capture, rule effects, and hand-typed spec fields can put
// ANY key in there. Without an allowlist, an unexpected key (or a value that
// happens to carry an internal-only word) rides straight onto a vendor-facing
// PDF next to the trade line amounts. Case-tolerant; matched lowercase.
const DIMENSION_KEY_ALLOWLIST: ReadonlySet<string> = new Set([
  'width',
  'depth',
  'height',
  'length',
  'diameter',
  'seatheight',
  'seatdepth',
  'seatwidth',
  'armheight',
  'backheight',
  'legheight',
  'clearance',
  'weight',
  'unit',
]);

function isAllowedDimensionKey(key: string): boolean {
  return DIMENSION_KEY_ALLOWLIST.has(key.toLowerCase());
}

// Defence in depth: even an allowlisted key (e.g. a hand-typed "clearance")
// must not carry a value that mentions internal-only money vocabulary.
const FORBIDDEN_VALUE_SUBSTRINGS = ['trade', 'markup', 'margin', 'retail', 'price'];

function hasForbiddenSubstring(value: string): boolean {
  const lower = value.toLowerCase();
  return FORBIDDEN_VALUE_SUBSTRINGS.some((needle) => lower.includes(needle));
}

/**
 * "72 × 36 × 30 in" when width/depth/height all resolve; otherwise up to four
 * `key value` pairs from the dimension-key allowlist (capture, variant and
 * rule-effect dimensions do not share one key set, so unknown-but-plausible
 * keys like `diameter`/`seatHeight` are still tolerated) — any key outside
 * the allowlist, or any value containing forbidden money vocabulary, is
 * dropped rather than printed. The unit is appended when present and clean.
 */
function formatDimensions(value: unknown): string | null {
  const dims = readRecord(value);
  const rawUnit = readScalar(dims.unit ?? dims.units);
  const unit = rawUnit && !hasForbiddenSubstring(rawUnit) ? rawUnit : null;
  const width = readScalar(dims.width ?? dims.w);
  const depth = readScalar(dims.depth ?? dims.d);
  const height = readScalar(dims.height ?? dims.h);
  if (
    width &&
    depth &&
    height &&
    !hasForbiddenSubstring(width) &&
    !hasForbiddenSubstring(depth) &&
    !hasForbiddenSubstring(height)
  ) {
    return [`${width} × ${depth} × ${height}`, unit].filter(Boolean).join(' ');
  }
  const pairs = Object.entries(dims)
    .filter(([key]) => key !== 'unit' && key !== 'units')
    .filter(([key]) => isAllowedDimensionKey(key))
    .map(([key, entry]) => {
      const scalar = readScalar(entry);
      if (!scalar || hasForbiddenSubstring(scalar)) return null;
      return `${key} ${scalar}`;
    })
    .filter((entry): entry is string => entry !== null);
  if (pairs.length === 0) return null;
  return [pairs.slice(0, 4).join(' · '), unit].filter(Boolean).join(' ');
}

/** COM/COL instruction lines (00413 `comDetails`, merged into the snapshot). */
function comLines(value: unknown): string[] {
  const com = readRecord(value);
  if (Object.keys(com).length === 0) return [];
  const lines: string[] = [];

  const fabricName = readScalar(com.fabricName ?? com.fabric_name);
  const millPattern = [
    readScalar(com.mill),
    readScalar(com.pattern),
  ].filter(Boolean).join(', ');
  if (fabricName && millPattern) lines.push(`COM: ${fabricName} — ${millPattern}`);
  else if (fabricName || millPattern) lines.push(`COM: ${fabricName || millPattern}`);

  const yardageBits: string[] = [];
  const yardage = readScalar(com.yardage);
  if (yardage) yardageBits.push(`${yardage} yds`);
  if (com.railroaded === true) yardageBits.push('railroaded');
  if (yardageBits.length > 0) lines.push(`COM yardage: ${yardageBits.join(', ')}`);

  const shipTo = readScalar(com.shipTo ?? com.ship_to);
  if (shipTo) lines.push(`COM ship-to: ${shipTo}`);

  const sidemark = readScalar(com.sidemark);
  if (sidemark) lines.push(`Sidemark: ${sidemark}`);

  // Always — a COM order's clock does not start until the fabric lands, and
  // the vendor is the party who has to know that.
  lines.push('Lead time provisional until COM fabric received');
  return lines;
}

/**
 * Vendor-safe spec block for one PO line, printed under the item name.
 *
 * Configured line (non-empty `configuration_snapshot`):
 *   Variant: King Walnut (VEN-BED-K-WAL)      ← only when a variant matched
 *   Wood: Walnut                              ← one line per selection, ALL groups
 *   Hardware: Antique Brass
 *   Components: Left arm ×1 · Chaise ×2       ← one joined line
 *   Dims: 84 × 40 × 34 in
 *   COM: Belgian Linen 12 — Rogers & Goffigon, Cascade
 *   COM yardage: 14 yds, railroaded
 *   COM ship-to: Vendor receiving, 22 Mill Rd
 *   Sidemark: MWS-HARLOW
 *   Lead time provisional until COM fabric received
 *   Config ref: 9f2c1a77b0de
 *
 * Unconfigured line (`configuration_snapshot` is `{}` — the column default):
 *   falls back to the flat spec fields (SKU / Material / Finish / Color-Fabric
 *   / Dims from selected_dimensions).
 *
 * Returns [] when neither source has anything to say.
 */
export function vendorConfigurationLines(spec: unknown): string[] {
  // A PostgREST embed of a UNIQUE FK returns an object, but tolerate the
  // array form so a query shape change cannot silently blank the block.
  const source = readRecord(Array.isArray(spec) ? spec[0] : spec) as VendorConfigurationSpec &
    Record<string, unknown>;

  const snapshot = readRecord(
    source.configuration_snapshot ?? source.configurationSnapshot ?? source.snapshot,
  );
  const lines: string[] = [];

  if (Object.keys(snapshot).length > 0) {
    const variant = readRecord(snapshot.variant);
    const variantName = readScalar(variant.name ?? variant.code);
    if (variantName) {
      const variantSku = readScalar(variant.vendorSku ?? variant.vendor_sku ?? variant.sku);
      lines.push(variantSku ? `Variant: ${variantName} (${variantSku})` : `Variant: ${variantName}`);
    }

    for (const selection of readArray(snapshot.selections)) {
      const group = readScalar(selection.groupName ?? selection.groupCode);
      const value = readScalar(selection.valueLabel ?? selection.valueCode);
      if (group && value) lines.push(`${group}: ${value}`);
      else if (value) lines.push(value);
    }

    const componentLabels = readArray(snapshot.components)
      .map((component) => {
        const name = readScalar(component.name ?? component.code);
        if (!name) return null;
        const quantity = readCount(component.quantity);
        const handedness = readScalar(component.handedness);
        const suffix = handedness ? ` (${handedness})` : '';
        return quantity && quantity > 1 ? `${name} ×${quantity}${suffix}` : `${name}${suffix}`;
      })
      .filter((entry): entry is string => entry !== null);
    if (componentLabels.length > 0) {
      lines.push(`Components: ${componentLabels.join(' · ')}`);
    }

    const dims = formatDimensions(snapshot.dimensions);
    if (dims) lines.push(`Dims: ${dims}`);

    lines.push(...comLines(snapshot.comDetails ?? snapshot.com_details));

    const hash = readScalar(
      source.configuration_snapshot_hash ??
        source.configurationSnapshotHash ??
        source.snapshotHash,
    );
    if (hash) lines.push(`Config ref: ${hash.slice(0, 12)}`);
    return lines;
  }

  // ── Fallback: flat spec fields (the pre-configuration world) ─────────────
  const sku = readScalar(source.sku);
  if (sku) lines.push(`SKU: ${sku}`);
  const material = readScalar(source.material);
  if (material) lines.push(`Material: ${material}`);
  const finish = readScalar(source.finish);
  if (finish) lines.push(`Finish: ${finish}`);
  const colorFabric = readScalar(source.color_fabric ?? source.colorFabric);
  if (colorFabric) lines.push(`Color/Fabric: ${colorFabric}`);
  const flatDims = formatDimensions(
    source.selected_dimensions ?? source.selectedDimensions,
  );
  if (flatDims) lines.push(`Dims: ${flatDims}`);
  return lines;
}
