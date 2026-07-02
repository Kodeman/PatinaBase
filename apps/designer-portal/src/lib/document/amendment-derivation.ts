/**
 * Amendment derivation (Track 7 · R81) — the pure impact math and status
 * vocabulary behind the Amendment sheet. Ported from the legacy
 * scope-change-form (new total = current total + FF&E + fee additions) and the
 * scope-change detail page's status semantics, presentation-free.
 *
 * The margin and the Account band ARE the status tracking (R81 — no list
 * page), so the words here must stay honest to scope_change_requests' CHECK
 * vocabulary: draft · sent · viewed · approved · declined · cancelled, with
 * applied_at marking an approved change that has landed on the project.
 */


type AnyRecord = any;

export interface AmendmentImpacts {
  additionalFfeCents: number;
  additionalFeeCents: number;
  timelineWeeks: number;
}

/** New total project value = current contract total + both additions (the
 *  legacy form's math, cents-safe). Current total follows the post-00139
 *  convention: total_amount_cents ?? budget_cents. */
export function computeAmendmentTotals(
  project: { total_amount_cents?: number | null; budget_cents?: number | null } | null | undefined,
  impacts: AmendmentImpacts,
): { currentCents: number; newTotalCents: number } {
  const currentCents = project?.total_amount_cents ?? project?.budget_cents ?? 0;
  return {
    currentCents,
    newTotalCents: currentCents + impacts.additionalFfeCents + impacts.additionalFeeCents,
  };
}

/** The lifecycle word an amendment wears (quiet mono, R56-style legibility). */
export function amendmentStatusWord(scr: {
  status: string;
  applied_at?: string | null;
}): string {
  if (scr.status === 'approved') return scr.applied_at ? 'Applied' : 'Approved';
  switch (scr.status) {
    case 'draft':
      return 'Draft';
    case 'sent':
    case 'viewed':
      return 'With the client';
    case 'declined':
      return 'Declined';
    case 'cancelled':
      return 'Cancelled';
    default:
      return scr.status;
  }
}

/** An amendment is open while it still needs a hand — drafted, out with the
 *  client, or approved-but-not-yet-applied. */
export function isAmendmentOpen(scr: { status: string; applied_at?: string | null }): boolean {
  if (scr.status === 'approved') return !scr.applied_at;
  return scr.status === 'draft' || scr.status === 'sent' || scr.status === 'viewed';
}

/** "+$4,200 · +2 weeks" — the one-line impact reading for a ledger row. */
export function amendmentImpactLine(scr: AnyRecord): string {
  const money =
    (scr.additional_ffe_budget_cents ?? 0) + (scr.additional_design_fee_cents ?? 0);
  const parts: string[] = [];
  if (money !== 0) {
    parts.push(
      `${money > 0 ? '+' : '−'}$${Math.abs(Math.round(money / 100)).toLocaleString('en-US')}`,
    );
  }
  const weeks = scr.timeline_impact_weeks ?? 0;
  if (weeks !== 0) parts.push(`${weeks > 0 ? '+' : ''}${weeks} week${Math.abs(weeks) === 1 ? '' : 's'}`);
  return parts.length > 0 ? parts.join(' · ') : 'No fee or timeline impact';
}

/** Rooms composed in the sheet are stored snake_case so apply_scope_change
 *  (00084) — which reads room_type / budget_cents — applies them faithfully.
 *  (The legacy camelCase payloads were only understood by the client-side
 *  apply path.) */
export function roomToStoredShape(room: {
  name: string;
  budgetCents: number;
}): { name: string; room_type: null; budget_cents: number; ffe_categories: string[] } {
  return {
    name: room.name,
    room_type: null,
    budget_cents: room.budgetCents,
    ffe_categories: [],
  };
}
