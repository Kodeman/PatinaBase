// ─────────────────────────────────────────────────────────────────────────────
// Fulfillment line/PO state machines — TypeScript mirror.
//
// ⚠ The SQL triggers enforce_fulfillment_line_transition() and
//   enforce_fulfillment_po_transition() in
//   supabase/migrations/00350_fulfillment_core.sql are AUTHORITATIVE.
//   This file mirrors them for the data/UI layer — keep it in sync whenever the
//   transition rules change.
//
// Rules (spec §2): exactly one step forward along the ordered chain; `cancelled`
// is terminal and reachable ONLY from pre-`shipped` states.
// ─────────────────────────────────────────────────────────────────────────────

import type { LineState, PoState } from './types';

/** Ordered forward chain for order-item lines (spec §2). `cancelled` is terminal. */
export const LINE_CHAIN: readonly LineState[] = [
  'intake',
  'split',
  'transmitted',
  'acknowledged',
  'in_production',
  'shipped',
  'delivered',
  'settled',
];

/** Ordered forward chain for vendor POs (spec §2). `cancelled` is terminal. */
export const PO_CHAIN: readonly PoState[] = [
  'draft',
  'sent',
  'acknowledged',
  'in_production',
  'shipped',
  'delivered',
  'settled',
];

/** States before `shipped` — the only ones from which `cancelled` is reachable. */
function preShipped<T extends string>(chain: readonly T[]): readonly T[] {
  return chain.slice(0, chain.indexOf('shipped' as T));
}

export const LINE_PRE_SHIPPED = preShipped(LINE_CHAIN);
export const PO_PRE_SHIPPED = preShipped(PO_CHAIN);

function buildTransitions<T extends string>(
  chain: readonly T[],
  preShippedStates: readonly T[],
): Record<T, readonly T[]> {
  const map = {} as Record<T, readonly T[]>;
  chain.forEach((state, i) => {
    const next: T[] = [];
    if (i + 1 < chain.length) next.push(chain[i + 1]); // one step forward only
    if (preShippedStates.includes(state)) next.push('cancelled' as T);
    map[state] = next;
  });
  map['cancelled' as T] = []; // terminal
  return map;
}

export const LINE_TRANSITIONS = buildTransitions(LINE_CHAIN, LINE_PRE_SHIPPED);
export const PO_TRANSITIONS = buildTransitions(PO_CHAIN, PO_PRE_SHIPPED);

export function canLineTransition(from: LineState, to: LineState): boolean {
  return LINE_TRANSITIONS[from]?.includes(to) ?? false;
}

export function canPoTransition(from: PoState, to: PoState): boolean {
  return PO_TRANSITIONS[from]?.includes(to) ?? false;
}
