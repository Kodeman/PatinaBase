// ─────────────────────────────────────────────────────────────────────────────
// Pipeline board stage/column helpers — PURE module (no React, no I/O).
//
// /mission-control/pipelines renders two kanbans (Designers | Makers) backed
// by different tables with different stage vocabularies:
//   - designer_prospects (00305): sourced -> contacted -> meeting ->
//     founding_circle, or passed (archived).
//   - pipeline_vendors (00076): discovery -> qualification -> outreach ->
//     negotiation -> onboarding -> live, or paused/rejected (archived).
//
// Keeping the column ordering, labels, doc-language sublabels, and the
// age-in-stage formatter here (rather than inline in the board components)
// lets the jest suite assert them without a DOM or a database — mirrors
// lib/run-rows.ts and mission-control/confidence-badge.tsx's testable-band
// pattern.
// ─────────────────────────────────────────────────────────────────────────────

export type DesignerProspectStage =
  | 'sourced'
  | 'contacted'
  | 'meeting'
  | 'founding_circle'
  | 'passed';

export type VendorStage =
  | 'discovery'
  | 'qualification'
  | 'outreach'
  | 'negotiation'
  | 'onboarding'
  | 'live'
  | 'paused'
  | 'rejected';

export const DESIGNER_PROSPECT_STAGES: readonly DesignerProspectStage[] = [
  'sourced',
  'contacted',
  'meeting',
  'founding_circle',
  'passed',
] as const;

export const VENDOR_STAGES: readonly VendorStage[] = [
  'discovery',
  'qualification',
  'outreach',
  'negotiation',
  'onboarding',
  'live',
  'paused',
  'rejected',
] as const;

export function isDesignerProspectStage(v: string): v is DesignerProspectStage {
  return (DESIGNER_PROSPECT_STAGES as readonly string[]).includes(v);
}

export function isVendorStage(v: string): v is VendorStage {
  return (VENDOR_STAGES as readonly string[]).includes(v);
}

/** 'passed' is the sole archived designer-prospect stage — hidden by default. */
export const DESIGNER_PROSPECT_ACTIVE_STAGES: readonly DesignerProspectStage[] = [
  'sourced',
  'contacted',
  'meeting',
  'founding_circle',
] as const;
export const DESIGNER_PROSPECT_ARCHIVED_STAGES: readonly DesignerProspectStage[] = ['passed'] as const;

/** 'paused'/'rejected' are the archived vendor stages — hidden by default. */
export const VENDOR_ACTIVE_STAGES: readonly VendorStage[] = [
  'discovery',
  'qualification',
  'outreach',
  'negotiation',
  'onboarding',
  'live',
] as const;
export const VENDOR_ARCHIVED_STAGES: readonly VendorStage[] = ['paused', 'rejected'] as const;

/** Column order for the Designers board, honoring the "Show archived" toggle. */
export function designerProspectColumns(
  showArchived: boolean,
): readonly DesignerProspectStage[] {
  return showArchived ? DESIGNER_PROSPECT_STAGES : DESIGNER_PROSPECT_ACTIVE_STAGES;
}

/** Column order for the Makers board, honoring the "Show archived" toggle. */
export function vendorColumns(showArchived: boolean): readonly VendorStage[] {
  return showArchived ? VENDOR_STAGES : VENDOR_ACTIVE_STAGES;
}

export const DESIGNER_PROSPECT_STAGE_LABELS: Record<DesignerProspectStage, string> = {
  sourced: 'Sourced',
  contacted: 'Contacted',
  meeting: 'Meeting',
  founding_circle: 'Founding Circle',
  passed: 'Passed',
};

export const VENDOR_STAGE_LABELS: Record<VendorStage, string> = {
  discovery: 'Discovery',
  qualification: 'Qualification',
  outreach: 'Outreach',
  negotiation: 'Negotiation',
  onboarding: 'Onboarding',
  live: 'Live',
  paused: 'Paused',
  rejected: 'Rejected',
};

/**
 * Doc-language sublabels shown under the real maker stage names on the
 * board (per the WP-2.2 brief: "applied/rubric/brand-scored/trade
 * paperwork/…"). Cosmetic only — never sent to the RPC or stored; the real
 * stage values stay the pipeline_vendors CHECK vocabulary.
 */
export const VENDOR_STAGE_SUBLABELS: Record<VendorStage, string> = {
  discovery: 'sourced',
  qualification: 'applied · rubric',
  outreach: 'brand-scored',
  negotiation: 'terms',
  onboarding: 'trade paperwork',
  live: 'active',
  paused: 'on hold',
  rejected: 'closed',
};

// ─── Age-in-stage ───────────────────────────────────────────────────────────

/** Fractional days between stageEnteredAt and now; 0 for missing/invalid input. */
export function daysInStage(
  stageEnteredAt: string | null | undefined,
  now: Date = new Date(),
): number {
  if (!stageEnteredAt) return 0;
  const entered = Date.parse(stageEnteredAt);
  if (Number.isNaN(entered)) return 0;
  const ms = Math.max(0, now.getTime() - entered);
  return ms / (1000 * 60 * 60 * 24);
}

/** DM-Mono-style short duration, e.g. "<1h", "6h", "12d". */
export function formatAgeInStage(
  stageEnteredAt: string | null | undefined,
  now: Date = new Date(),
): string {
  if (!stageEnteredAt) return '—';
  const entered = Date.parse(stageEnteredAt);
  if (Number.isNaN(entered)) return '—';
  const ms = Math.max(0, now.getTime() - entered);
  const hours = ms / (1000 * 60 * 60);
  if (hours < 1) return '<1h';
  if (hours < 24) return `${Math.floor(hours)}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** Threshold past which a card's age reads terracotta (spec: >14d). */
export const AGE_STALE_THRESHOLD_DAYS = 14;

export function isAgeStale(
  stageEnteredAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  return daysInStage(stageEnteredAt, now) > AGE_STALE_THRESHOLD_DAYS;
}

// ─── Maker card formatting ──────────────────────────────────────────────────

/** "NNN/500" when a vendor has been scored, else null (card omits the line). */
export function formatVendorScore(totalScore: number | null | undefined): string | null {
  if (totalScore == null) return null;
  return `${totalScore}/500`;
}

export type TriageLevel = 'green' | 'yellow' | 'orange' | 'red';

export const TRIAGE_DOT_COLOR: Record<TriageLevel, string> = {
  green: 'var(--color-sage)',
  yellow: 'var(--color-clay)',
  orange: 'var(--color-terracotta)',
  red: 'var(--color-error)',
};
