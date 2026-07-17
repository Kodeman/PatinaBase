// @patina/fulfillment — Queue next-action verb formatting (S1).
//
// `fulfillment_queue_v` (00353) computes `next_action_kind` + `next_action_params`
// per row in SQL — this module is the ONLY place that turns a kind into the
// human verb the Queue renders in clay at the row's right edge (spec §5.1).
// The row list is NOT allowed to drop a row for an unrecognized kind (the UI
// half of the zero-invisibility invariant) — describeNextAction ALWAYS
// returns a string, falling back to a neutral verb for any kind it doesn't
// recognize (a future SQL kind, a stub, or a malformed payload).

export type NextActionKind =
  | 'assign_vendor'
  | 'resolve_exception'
  | 'confirm_split'
  | 'transmit_pos'
  | 'chase_ack'
  | 'awaiting_ack'
  | 'in_production'
  | 'in_transit'
  | 'awaiting_settlement'
  | 'review'
  | (string & {}); // unknown kinds are valid input — see fallback below

export interface NextActionParams {
  unmapped_count?: number | null;
  exception_count?: number | null;
  po_count?: number | null;
  days_overdue?: number | null;
  [key: string]: unknown;
}

export interface NextAction {
  kind: NextActionKind;
  params?: NextActionParams | null;
}

const pluralize = (n: number, singular: string, plural = `${singular}s`) =>
  n === 1 ? singular : plural;

/**
 * Turn a queue row's next_action into the clay-colored verb shown at the row's
 * right edge. Every known kind renders a specific, informative verb; any kind
 * this function doesn't recognize renders the neutral "Review order" fallback
 * — the row still renders, it never drops off the queue.
 */
export function describeNextAction(action: NextAction | null | undefined): string {
  if (!action || !action.kind) return 'Review order';
  const params = action.params ?? {};

  switch (action.kind) {
    case 'assign_vendor': {
      const n = params.unmapped_count ?? 0;
      return n > 0 ? `Assign vendor — ${n} unmapped` : 'Assign vendor';
    }
    case 'resolve_exception': {
      const n = params.exception_count ?? 0;
      return n > 0
        ? `Resolve ${pluralize(n, 'exception')} — ${n} open`
        : 'Resolve exception';
    }
    case 'confirm_split':
      return 'Confirm split';
    case 'transmit_pos': {
      const n = params.po_count ?? 0;
      return n > 0 ? `Send ${n} ${pluralize(n, 'PO')}` : 'Send POs';
    }
    case 'chase_ack': {
      const days = params.days_overdue;
      return typeof days === 'number' && days > 0
        ? `Chase ack — day ${days}`
        : 'Chase overdue acknowledgment';
    }
    case 'awaiting_ack':
      return 'Awaiting acknowledgment';
    case 'in_production':
      return 'In production';
    case 'in_transit':
      return 'In transit';
    case 'awaiting_settlement':
      return 'Awaiting settlement';
    case 'review':
      return 'Review order';
    default:
      // Unrecognized kind (future SQL addition, stub, or malformed payload) —
      // neutral fallback. Never throw, never render blank, never drop the row.
      return 'Review order';
  }
}

/**
 * True when a queue row's age should render in terracotta (SLA breach).
 * Thin re-export of the row's own `breached` boolean for call-site clarity —
 * kept here so UI code has one import for "how do I decide the age color".
 */
export function isBreachedAge(breached: boolean | null | undefined): boolean {
  return breached === true;
}

/** Formats the business-hours age of a queue row's current stage for display. */
export function formatStageAge(hours: number | null | undefined): string {
  if (hours == null || Number.isNaN(hours)) return '—';
  if (hours < 1) return '<1h';
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = Math.round(hours / 8); // business days (8h business day, §10 calendar)
  return `${days}d`;
}
