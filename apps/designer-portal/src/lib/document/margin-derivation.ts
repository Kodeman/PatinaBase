/**
 * Margin derivation — spec v1.1 §5, prototype v0.4 .m-item anatomy.
 *
 * Pure presentation logic over `margin_items` view rows (00191): kind
 * accents, the mono kind-line, resolved sinking, and rail ordering.
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
 *  they stay active. */
export function isResolved(row: MarginItemRow): boolean {
  return (
    (row.kind === 'decision' && row.state === 'responded') ||
    (row.kind === 'pulse' && row.state === 'sent') ||
    (row.kind === 'note' && row.state === 'escalated')
  );
}

function sortKey(row: MarginItemRow): [number, number] {
  // Dued notes join needs-action ordering PROVISIONALLY (R14 cites R12,
  // whose text is missing from the log — DECISIONS O6).
  const needsAction =
    (row.kind === 'decision' && row.state === 'overdue') ||
    (row.kind === 'note' && row.state === 'due');
  const group = isResolved(row) ? 2 : needsAction ? 0 : 1;
  return [group, -new Date(row.ts).getTime()];
}

/** Rail order: overdue decisions pinned, then active newest-first, then resolved. */
export function orderMarginItems(rows: MarginItemRow[], _now: Date): MarginItemRow[] {
  return [...rows].sort((a, b) => {
    const ka = sortKey(a);
    const kb = sortKey(b);
    return ka[0] - kb[0] || ka[1] - kb[1];
  });
}
