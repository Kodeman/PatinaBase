/**
 * UI-facing rules for made-to-measure commissions.
 *
 * The database owns persistence and transition authorization. These helpers
 * keep the designer experience honest before a mutation is attempted: only a
 * draft may be edited, submitted work is revised by forking a new draft, and
 * an issued snapshot never moves when its Library source changes.
 */

export type CommissionLifecycleStatus =
  | 'draft'
  | 'submitted'
  | 'quoted'
  | 'client_review'
  | 'approved'
  | 'issued'
  | 'rejected'
  | 'superseded';

export type CommissionRevisionTransitionStatus = Exclude<
  CommissionLifecycleStatus,
  'issued' | 'superseded'
>;

export interface CommissionDimensions {
  width: string;
  depth: string;
  height: string;
  unit: 'in' | 'mm';
  siteNotes: string;
}

export interface CommissionQuoteDraft {
  reference: string;
  amount: string;
  validUntil: string;
  leadTimeWeeks: string;
}

export interface CommissionBriefDraft {
  projectId: string;
  name: string;
  scope: string;
  dimensions: CommissionDimensions;
  material: string;
  finish: string;
  fabricatorVendorId: string;
  fabricator: string;
  drawingReferences: string[];
  allowance: string;
  priceOnRequest: boolean;
  quote: CommissionQuoteDraft;
  designerApproval: 'pending' | 'approved';
  clientApproval: 'pending' | 'approved';
}

export interface CommissionBriefErrors {
  projectId?: string;
  name?: string;
  dimensions?: string;
  material?: string;
  finish?: string;
  fabricator?: string;
  price?: string;
  quote?: string;
}

export interface CommissionSnapshotSummary {
  title: string;
  dimensions: string | null;
  materialFinish: string | null;
  fabricator: string | null;
  quote: string | null;
  drawingCount: number;
  revision: number | null;
  hash: string | null;
}

export interface ConfigurationSnapshotEnvelope {
  configurationId: string | null;
  snapshot: unknown;
  hash: string | null;
  approvedHash: string | null;
  lockedAt: string | null;
}

export type SnapshotSafety =
  | { kind: 'draft'; message: string }
  | { kind: 'approved'; message: string }
  | { kind: 'issued'; message: string }
  | { kind: 'requires_reapproval'; message: string };

const TRANSITIONS: Record<
  CommissionLifecycleStatus,
  CommissionRevisionTransitionStatus[]
> = {
  draft: ['submitted'],
  submitted: ['quoted'],
  quoted: ['client_review'],
  client_review: ['approved', 'rejected'],
  approved: [],
  issued: [],
  rejected: [],
  superseded: [],
};

export const EMPTY_COMMISSION_BRIEF: CommissionBriefDraft = {
  projectId: '',
  name: '',
  scope: '',
  dimensions: {
    width: '',
    depth: '',
    height: '',
    unit: 'in',
    siteNotes: '',
  },
  material: '',
  finish: '',
  fabricatorVendorId: '',
  fabricator: '',
  drawingReferences: [],
  allowance: '',
  priceOnRequest: true,
  quote: {
    reference: '',
    amount: '',
    validUntil: '',
    leadTimeWeeks: '',
  },
  designerApproval: 'pending',
  clientApproval: 'pending',
};

function clean(value: string): string {
  return value.trim();
}

function parseMoneyToCents(value: string): number | null {
  const normalized = value.replace(/[$,\s]/g, '');
  if (!normalized) return null;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function normalizeCommissionStatus(status: string): CommissionLifecycleStatus {
  switch (status) {
    case 'quote_received':
    case 'quote_revised':
      return 'quoted';
    case 'designer_approved':
      return 'client_review';
    case 'client_approved':
      return 'approved';
    case 'locked':
    case 'ordered':
      return 'issued';
    case 'submitted':
    case 'quoted':
    case 'client_review':
    case 'approved':
    case 'issued':
    case 'rejected':
    case 'superseded':
      return status;
    default:
      return 'draft';
  }
}

export function canEditCommissionRevision(status: string): boolean {
  return normalizeCommissionStatus(status) === 'draft';
}

export function canTransitionCommissionRevision(
  current: string,
  target: CommissionRevisionTransitionStatus,
): boolean {
  return TRANSITIONS[normalizeCommissionStatus(current)].includes(target);
}

export function assertCommissionTransition(
  current: string,
  target: CommissionRevisionTransitionStatus,
): CommissionRevisionTransitionStatus {
  const normalized = normalizeCommissionStatus(current);
  if (!canTransitionCommissionRevision(normalized, target)) {
    throw new Error(
      `${normalized.replaceAll('_', ' ')} commissions cannot move directly to ${target.replaceAll('_', ' ')}.`,
    );
  }
  return target;
}

export function canIssueCommission(brief: CommissionBriefDraft): boolean {
  return (
    brief.designerApproval === 'approved' && brief.clientApproval === 'approved'
  );
}

export function validateCommissionBrief(
  brief: CommissionBriefDraft,
): CommissionBriefErrors {
  const errors: CommissionBriefErrors = {};
  if (!clean(brief.projectId)) errors.projectId = 'Choose the project this piece belongs to.';
  if (!clean(brief.name)) errors.name = 'Name this commission.';
  if (
    !clean(brief.dimensions.width) ||
    !clean(brief.dimensions.depth) ||
    !clean(brief.dimensions.height)
  ) {
    errors.dimensions = 'Width, depth, and height are required.';
  } else if (
    [
      brief.dimensions.width,
      brief.dimensions.depth,
      brief.dimensions.height,
    ].some((value) => !Number.isFinite(Number(value)) || Number(value) <= 0)
  ) {
    errors.dimensions = 'Enter positive numbers for width, depth, and height.';
  }
  if (!clean(brief.material)) errors.material = 'Name the material.';
  if (!clean(brief.finish)) errors.finish = 'Name the finish.';
  if (!clean(brief.fabricatorVendorId) && !clean(brief.fabricator)) {
    errors.fabricator = 'Choose or name the fabricator.';
  }

  const allowance = parseMoneyToCents(brief.allowance);
  if (!brief.priceOnRequest && allowance === null && !clean(brief.quote.amount)) {
    errors.price = 'Add an allowance, a quote, or mark price on request.';
  }
  if (clean(brief.quote.amount) && parseMoneyToCents(brief.quote.amount) === null) {
    errors.quote = 'Enter the quote as a valid dollar amount.';
  }
  return errors;
}

export function hasCommissionBriefErrors(errors: CommissionBriefErrors): boolean {
  return Object.keys(errors).length > 0;
}

export function buildCustomRequirements(
  brief: CommissionBriefDraft,
): Record<string, unknown> {
  return {
    kind: 'custom_commission',
    scope: clean(brief.scope) || null,
    dimensions: {
      width: clean(brief.dimensions.width),
      depth: clean(brief.dimensions.depth),
      height: clean(brief.dimensions.height),
      unit: brief.dimensions.unit,
      site_notes: clean(brief.dimensions.siteNotes) || null,
    },
    material: clean(brief.material),
    finish: clean(brief.finish),
    fabricator_vendor_id: clean(brief.fabricatorVendorId) || null,
    fabricator: clean(brief.fabricator),
    drawing_references: brief.drawingReferences.map(clean).filter(Boolean),
    allowance_cents: parseMoneyToCents(brief.allowance),
    price_on_request: brief.priceOnRequest,
    quote: {
      reference: clean(brief.quote.reference) || null,
      amount_cents: parseMoneyToCents(brief.quote.amount),
      valid_until: clean(brief.quote.validUntil) || null,
      lead_time_weeks: clean(brief.quote.leadTimeWeeks)
        ? Number(brief.quote.leadTimeWeeks)
        : null,
    },
    approvals: {
      designer: brief.designerApproval,
      client: brief.clientApproval,
    },
  };
}

export function commissionBriefFromRequirements(
  requirements: unknown,
  seed: Partial<Pick<CommissionBriefDraft, 'projectId' | 'name'>> = {},
): CommissionBriefDraft {
  const root = readRecord(requirements);
  const dimensions = readRecord(root.dimensions);
  const quote = readRecord(root.quote);
  const approvals = readRecord(root.approvals);
  const drawingReferences = Array.isArray(root.drawing_references)
    ? root.drawing_references.filter((value): value is string => typeof value === 'string')
    : [];
  const allowanceCents = readNumber(root.allowance_cents);
  const quoteCents = readNumber(quote.amount_cents);
  return {
    ...EMPTY_COMMISSION_BRIEF,
    projectId: seed.projectId ?? '',
    name: seed.name ?? '',
    scope: readString(root.scope) ?? '',
    dimensions: {
      width: readString(dimensions.width) ?? '',
      depth: readString(dimensions.depth) ?? '',
      height: readString(dimensions.height) ?? '',
      unit: dimensions.unit === 'mm' ? 'mm' : 'in',
      siteNotes: readString(dimensions.site_notes) ?? '',
    },
    material: readString(root.material) ?? '',
    finish: readString(root.finish) ?? '',
    fabricatorVendorId: readString(root.fabricator_vendor_id) ?? '',
    fabricator: readString(root.fabricator) ?? '',
    drawingReferences,
    allowance: allowanceCents === null ? '' : (allowanceCents / 100).toFixed(2),
    priceOnRequest: root.price_on_request !== false,
    quote: {
      reference: readString(quote.reference) ?? '',
      amount: quoteCents === null ? '' : (quoteCents / 100).toFixed(2),
      validUntil: readString(quote.valid_until) ?? '',
      leadTimeWeeks:
        readNumber(quote.lead_time_weeks)?.toString() ?? '',
    },
    designerApproval: approvals.designer === 'approved' ? 'approved' : 'pending',
    clientApproval: approvals.client === 'approved' ? 'approved' : 'pending',
  };
}

export function formatCommissionMoney(cents: number | null): string | null {
  if (cents === null) return null;
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

export function summarizeCommissionSnapshot(snapshot: unknown): CommissionSnapshotSummary {
  const root = readRecord(snapshot);
  const canonicalSnapshot = readRecord(root.snapshot);
  const configured = Object.keys(canonicalSnapshot).length > 0 ? canonicalSnapshot : root;
  const custom = readRecord(
    root.custom_brief ??
      root.customBrief ??
      root.custom_requirements ??
      root.customRequirements ??
      root,
  );
  const canonicalMeasurements = Array.isArray(custom.measurements)
    ? custom.measurements.map(readRecord)
    : [];
  const isCanonicalCustomBrief =
    readString(custom.summary) !== null || canonicalMeasurements.length > 0;
  if (isCanonicalCustomBrief) {
    const measurement = (label: string): string | null => {
      const entry = canonicalMeasurements.find(
        (candidate) => readString(candidate.label)?.toLowerCase() === label,
      );
      const value = entry ? readNumber(entry.value) : null;
      const unit = entry ? readString(entry.unit) : null;
      return value === null ? null : `${value}${unit ? ` ${unit}` : ''}`;
    };
    const measurementParts = ['width', 'depth', 'height'].map(measurement);
    const materials = Array.isArray(custom.materials)
      ? custom.materials.filter((value): value is string => typeof value === 'string')
      : [];
    const drawings = Array.isArray(root.drawings)
      ? root.drawings
      : Array.isArray(custom.drawings)
        ? custom.drawings
        : [];
    const quote = readRecord(root.quote);
    const quoteCents =
      readNumber(quote.tradePriceCents ?? quote.trade_price_cents) ??
      readNumber(quote.retailPriceCents ?? quote.retail_price_cents);
    const allowanceCents = readNumber(
      custom.allowanceCents ?? custom.allowance_cents ?? custom.budgetCents,
    );
    const fabricator =
      readString(custom.fabricatorName ?? custom.fabricator) ?? null;
    return {
      title:
        readString(root.name) ??
        readString(root.title) ??
        readString(custom.summary) ??
        'Custom commission',
      dimensions: measurementParts.every(Boolean)
        ? measurementParts.join(' × ')
        : measurementParts.filter(Boolean).join(' · ') || null,
      materialFinish:
        [...materials, readString(custom.finish)].filter(Boolean).join(' · ') ||
        null,
      fabricator,
      quote:
        formatCommissionMoney(quoteCents) ??
        formatCommissionMoney(allowanceCents) ??
        (custom.priceOnRequest === true ? 'Price on request' : null),
      drawingCount: drawings.length,
      revision: readNumber(root.revisionNumber ?? root.revision_number),
      hash: readString(
        root.snapshotHash ??
          root.configurationSnapshotHash ??
          root.configuration_hash ??
          root.configurationHash ??
          root.hash,
      ),
    };
  }
  const selections = Array.isArray(configured.selections)
    ? configured.selections.map(readRecord)
    : [];
  const components = Array.isArray(configured.components)
    ? configured.components.map(readRecord)
    : [];
  const isCanonicalConfiguration =
    readString(configured.productName) !== null ||
    readString(configured.configurationMode) !== null ||
    selections.length > 0 ||
    components.length > 0;
  if (isCanonicalConfiguration) {
    const variant = readRecord(configured.variant);
    const dimensions = readRecord(configured.dimensions);
    const dimensionParts = ['width', 'depth', 'height']
      .map((key) => dimensions[key])
      .filter((value) => typeof value === 'string' || typeof value === 'number')
      .map(String);
    const optionLabels = selections
      .map((selection) => {
        const group = readString(selection.groupName);
        const value = readString(selection.valueLabel);
        return group && value ? `${group}: ${value}` : value;
      })
      .filter(Boolean) as string[];
    const componentLabels = components
      .map((component) => {
        const name = readString(component.name);
        const quantity = readNumber(component.quantity);
        return name ? `${name}${quantity && quantity > 1 ? ` ×${quantity}` : ''}` : null;
      })
      .filter(Boolean) as string[];
    const retailPrice = readNumber(configured.retailPriceCents);
    const tradePrice = readNumber(configured.tradePriceCents);
    const leadTime = readNumber(configured.leadTimeWeeks);
    const commercial = [
      formatCommissionMoney(retailPrice ?? tradePrice),
      leadTime === null ? null : `${leadTime} week lead time`,
    ]
      .filter(Boolean)
      .join(' · ');
    const productName = readString(configured.productName) ?? 'Configured piece';
    const variantName = readString(variant.name);
    return {
      title: variantName ? `${productName} · ${variantName}` : productName,
      dimensions:
        dimensionParts.length === 3
          ? dimensionParts.join(' × ')
          : Object.entries(dimensions)
              .filter(([, value]) =>
                ['string', 'number'].includes(typeof value),
              )
              .slice(0, 3)
              .map(([key, value]) => `${key} ${String(value)}`)
              .join(' · ') || null,
      materialFinish:
        [...optionLabels, ...componentLabels].slice(0, 4).join(' · ') || null,
      fabricator: null,
      quote: commercial || null,
      drawingCount: 0,
      revision: readNumber(configured.schemaRevision),
      hash: readString(
        root.snapshotHash ??
          root.configurationSnapshotHash ??
          root.configuration_hash ??
          root.configurationHash ??
          root.hash,
      ),
    };
  }
  const brief = commissionBriefFromRequirements(custom, {
    name: readString(root.name) ?? readString(root.title) ?? 'Custom commission',
  });
  const dimensions = brief.dimensions;
  const completeDimensions = [dimensions.width, dimensions.depth, dimensions.height].every(
    Boolean,
  );
  const quoteRoot = readRecord(custom.quote);
  const quoteCents = readNumber(quoteRoot.amount_cents);
  const allowanceCents = readNumber(custom.allowance_cents);
  return {
    title: brief.name || 'Custom commission',
    dimensions: completeDimensions
      ? `${dimensions.width} × ${dimensions.depth} × ${dimensions.height} ${dimensions.unit}`
      : null,
    materialFinish:
      [brief.material, brief.finish].filter(Boolean).join(' · ') || null,
    fabricator: brief.fabricator || null,
    quote:
      formatCommissionMoney(quoteCents) ??
      formatCommissionMoney(allowanceCents) ??
      (brief.priceOnRequest ? 'Price on request' : null),
    drawingCount: brief.drawingReferences.length,
    revision: readNumber(root.revision_number ?? root.revisionNumber),
    hash: readString(root.configuration_hash ?? root.configurationHash ?? root.hash),
  };
}

export function assessSnapshotSafety(input: {
  workingHash?: string | null;
  approvedHash?: string | null;
  lockedAt?: string | null;
}): SnapshotSafety {
  const working = input.workingHash?.trim() || null;
  const approved = input.approvedHash?.trim() || null;
  if (input.lockedAt) {
    return {
      kind: 'issued',
      message: 'Issued snapshot locked. Library edits will not change this order.',
    };
  }
  if (approved && working && approved !== working) {
    return {
      kind: 'requires_reapproval',
      message: 'This revision changed after approval. Reapprove it before issuing or ordering.',
    };
  }
  if (approved) {
    return {
      kind: 'approved',
      message: 'Approved snapshot. Further changes start a new revision.',
    };
  }
  return {
    kind: 'draft',
    message: 'Working draft. Submit it to preserve a reviewable revision.',
  };
}

export function extractConfigurationSnapshotEnvelope(
  value: unknown,
): ConfigurationSnapshotEnvelope | null {
  const root = readRecord(value);
  const nestedSpec = readRecord(root.spec);
  const source = Object.keys(nestedSpec).length > 0 ? nestedSpec : root;
  const snapshot =
    source.configurationSnapshot ??
    source.configuration_snapshot ??
    source.snapshot ??
    null;
  if (!snapshot || typeof snapshot !== 'object') return null;
  return {
    configurationId: readString(
      source.configurationId ?? source.configuration_id,
    ),
    snapshot,
    hash: readString(
      source.configurationSnapshotHash ??
        source.configuration_snapshot_hash ??
        source.configurationHash ??
        source.configuration_hash ??
        source.snapshotHash,
    ),
    approvedHash: readString(
      source.approvedConfigurationHash ??
        source.approved_configuration_hash ??
        source.approvedHash,
    ),
    lockedAt: readString(
      source.configurationLockedAt ?? source.configuration_locked_at ?? source.lockedAt,
    ),
  };
}

export function formatConfigurationSnapshotForClipboard(value: unknown): string[] {
  const envelope = extractConfigurationSnapshotEnvelope(value);
  if (!envelope) return [];
  const summary = summarizeCommissionSnapshot({
    snapshot: envelope.snapshot,
    snapshotHash: envelope.hash,
  });
  const lines = [`Configuration: ${summary.title}`];
  if (summary.dimensions) lines.push(`Dimensions: ${summary.dimensions}`);
  if (summary.materialFinish) lines.push(`Selection: ${summary.materialFinish}`);
  if (summary.fabricator) lines.push(`Maker: ${summary.fabricator}`);
  if (summary.quote) lines.push(`Commercial: ${summary.quote}`);
  if (summary.drawingCount > 0) lines.push(`Drawings: ${summary.drawingCount}`);
  if (envelope.hash) lines.push(`Snapshot: ${envelope.hash}`);
  if (envelope.lockedAt) lines.push('State: issued snapshot (locked)');
  return lines;
}

export function parseDrawingReferences(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/\r?\n/)
        .map(clean)
        .filter(Boolean),
    ),
  );
}
