/**
 * Margin derivation — spec v1.2 §5, prototype v0.4 .m-item anatomy.
 *
 * Pure presentation logic over `margin_items` view rows (00194/00197): kind
 * accents, the mono kind-line, resolved sinking, and R12 rail ordering.
 * Dependency-free (no stages.ts / design-system — the Jest ESM trap).
 */

import { fmtDay } from './format';

export type MarginKind = 'decision' | 'message' | 'invoice' | 'pulse' | 'time' | 'note';
export type MarginAnchorKind = 'line' | 'section' | 'letterhead';

export interface MarginItemRow {
  kind: MarginKind;
  item_id: string;
  project_id: string | null;
  proposal_id: string | null;
  anchor_kind: MarginAnchorKind;
  anchor_id: string | null;
  state: string;
  title: string;
  detail: string;
  ts: string;
  payload: Record<string, unknown>;
}

/** Kind accent (2.5px left border) + label ink, per the prototype palette.
 *  Warm hues darken their label ink for contrast on paper. */
const ACCENT: Record<MarginKind, { border: string; label: string }> = {
  decision: { border: 'var(--color-golden-hour)', label: '#B89A2E' },
  message: { border: 'var(--color-dusty-blue)', label: 'var(--color-dusty-blue)' },
  invoice: { border: 'var(--color-clay)', label: '#A8895E' },
  pulse: { border: 'var(--color-sage)', label: '#85947C' },
  time: { border: 'var(--color-mocha)', label: 'var(--color-mocha)' },
  // R14: Mocha-adjacent, distinct from time — Aged Oak.
  note: { border: 'var(--color-aged-oak)', label: 'var(--color-aged-oak)' },
};

export function marginAccent(kind: MarginKind): { border: string; label: string } {
  return ACCENT[kind];
}

/** The .m-kind mono line. */
export function deriveKindLine(row: MarginItemRow): string {
  switch (row.kind) {
    case 'decision': {
      if (row.state === 'pending') {
        const due = row.payload.due_date as string | null | undefined;
        return due ? `Decision · due ${fmtDay(due)}` : 'Decision';
      }
      return `Decision · ${row.state}`;
    }
    case 'message': {
      const sender = row.payload.sender_name as string | null | undefined;
      return sender ? `Message · ${sender}` : 'Message';
    }
    case 'invoice':
      // R18: the 00189 payment-due flips arrive as Money items.
      if (row.payload.po_payment) return 'Money · vendor payment due';
      return `Money · ${row.state.replace(/_/g, ' ')}`;
    case 'pulse':
      if (row.state === 'due') return 'Friday Pulse · draft ready';
      if (row.state === 'sent') return 'Friday Pulse · sent';
      return 'Friday Pulse · draft';
    case 'time':
      return row.title;
    case 'note': {
      if (row.state === 'escalated') return 'Note · escalated';
      const due = row.payload.due_date as string | null | undefined;
      return due ? `Note · due ${fmtDay(due)}` : 'Note';
    }
  }
}

/** Resolved items render at reduced opacity and sink below active ones.
 *  Expired decisions and sent invoices still want the designer's eye —
 *  they stay active. R33 F1: a thread whose latest post is studio-authored
 *  (own_voice from 00206) is pre-settled — the margin asks for her hand,
 *  and her own voice never qualifies. */
export function isResolved(row: MarginItemRow): boolean {
  return (
    (row.kind === 'decision' && row.state === 'responded') ||
    (row.kind === 'message' && row.payload.own_voice === true) ||
    (row.kind === 'pulse' && row.state === 'sent') ||
    (row.kind === 'note' && row.state === 'escalated')
  );
}

const DAY_MS = 86_400_000;

/** R12 needs-action membership, urgency-ranked like the Desk. The Pulse
 *  follows the Desk's D5 gate — it floats Friday onward, never earlier. */
function needsActionRank(row: MarginItemRow, now: Date): number | null {
  if (row.kind === 'decision' && row.state === 'overdue') return 0;
  if (row.kind === 'note' && row.state === 'due') return 1;
  if (row.kind === 'pulse' && row.state === 'due') {
    const weekOf = row.payload.week_of as string | null | undefined;
    if (weekOf && now.getTime() >= new Date(`${weekOf}T00:00:00`).getTime() + 4 * DAY_MS) {
      return 2;
    }
  }
  return null;
}

export interface MarginAnchorRanks {
  /** project_ffe_items.id → rendered line index (the rail supplies it). */
  lineRank?: ReadonlyMap<string, number>;
}

/** Anchor position down the paper: letterhead band, then section anchors,
 *  then line anchors in rendered order. Unknown lines sink in their band. */
function anchorKey(row: MarginItemRow, ranks?: MarginAnchorRanks): [number, number] {
  if (row.anchor_kind === 'line') {
    const idx = row.anchor_id ? ranks?.lineRank?.get(row.anchor_id) : undefined;
    return [2, idx ?? Number.MAX_SAFE_INTEGER];
  }
  return [row.anchor_kind === 'section' ? 1 : 0, 0];
}

export interface MarginPartition {
  /** Needs-action float + active items in anchor order. */
  raised: MarginItemRow[];
  /** Resolved items — the rail folds these into "Settled · N" (R12). */
  settled: MarginItemRow[];
}

/** R12 — ordering under load: needs-action floats to the top (urgency-ranked,
 *  most overdue first) → everything else in anchor order (the margin reads
 *  top-to-bottom beside the paper it annotates; newest first within one
 *  anchor) → resolved items fold into the collapsed "Settled · N" group. */
export function partitionMargin(
  rows: MarginItemRow[],
  now: Date,
  ranks?: MarginAnchorRanks,
): MarginPartition {
  const needs: MarginItemRow[] = [];
  const active: MarginItemRow[] = [];
  const settled: MarginItemRow[] = [];

  for (const row of rows) {
    if (isResolved(row)) settled.push(row);
    else if (needsActionRank(row, now) !== null) needs.push(row);
    else active.push(row);
  }

  needs.sort(
    (a, b) =>
      needsActionRank(a, now)! - needsActionRank(b, now)! ||
      new Date(a.ts).getTime() - new Date(b.ts).getTime(),
  );
  active.sort((a, b) => {
    const ka = anchorKey(a, ranks);
    const kb = anchorKey(b, ranks);
    return ka[0] - kb[0] || ka[1] - kb[1] || new Date(b.ts).getTime() - new Date(a.ts).getTime();
  });
  settled.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  return { raised: [...needs, ...active], settled };
}
