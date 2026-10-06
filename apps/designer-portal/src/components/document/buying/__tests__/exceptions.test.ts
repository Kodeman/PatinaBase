/**
 * C-30 (d2 §M7): the exceptions overlay's rules — each type's clock sentence,
 * the exact args each resolution path sends, the substitution chain's stages
 * and calls, and R5's below-trade warning.
 */
import { WEEKDAY_SHORT_FORMAT, dayMonth, parseSourceDate } from '@/lib/document/dates';
import type { LineAuthorization } from '@/lib/document/authorization-derivation';
import {
  RESOLUTION_PATHS,
  alternateCandidates,
  alternateReading,
  changeOrderMessage,
  exceptionClockSentence,
  exceptionsForLine,
  makerLaneLine,
  pathGate,
  pathsFor,
  resolutionPlan,
  substitutionChangePlan,
  substitutionClose,
  substitutionStage,
  type ExceptionLike,
  type SubstituteLine,
  type SubstitutionDecision,
} from '../exceptions';

const TODAY = '2026-10-06';
const day = (ymd: string) => {
  const d = parseSourceDate(ymd)!;
  return `${WEEKDAY_SHORT_FORMAT.format(d)} ${dayMonth(d)}`;
};

function exc(partial: Partial<ExceptionLike> = {}): ExceptionLike {
  return {
    id: 'x1',
    project_id: 'p1',
    type: 'damage',
    status: 'open',
    ffe_item_id: 'item-1',
    purchase_order_id: 'po-1',
    clock_due_on: null,
    clock_basis: null,
    client_decision_id: null,
    po_change_id: null,
    ...partial,
  };
}

describe('exceptionClockSentence — a date with its basis in words', () => {
  it('prints the vendor clock as a date and its basis', () => {
    const { sentence, passed } = exceptionClockSentence(
      exc({ clock_due_on: '2026-10-08', clock_basis: 'Hewn wants written notice within 3 days of delivery.' }),
      TODAY,
    );
    expect(sentence).toBe(`By ${day('2026-10-08')}. Hewn wants written notice within 3 days of delivery.`);
    expect(passed).toBe(false);
  });

  it('prints the carrier clock for concealed damage', () => {
    const { sentence } = exceptionClockSentence(
      exc({
        type: 'concealed_damage',
        clock_due_on: '2026-10-11',
        clock_basis: 'The carrier wants concealed damage reported within 5 days of delivery.',
      }),
      TODAY,
    );
    expect(sentence).toBe(
      `By ${day('2026-10-11')}. The carrier wants concealed damage reported within 5 days of delivery.`,
    );
  });

  it('a passed claim clock still reads as a date, and filing is still possible', () => {
    const { sentence, passed } = exceptionClockSentence(
      exc({ type: 'short_ship', clock_due_on: '2026-10-01', clock_basis: 'Hewn wants written notice within 3 days of delivery.' }),
      TODAY,
    );
    expect(sentence).toBe(
      `Was due ${day('2026-10-01')} — you can still file. Hewn wants written notice within 3 days of delivery.`,
    );
    expect(passed).toBe(true);
  });

  it('a passed order-by date for a backorder does not invite filing', () => {
    const { sentence, passed } = exceptionClockSentence(
      exc({ type: 'backorder', clock_due_on: '2026-10-02', clock_basis: 'Order a substitute by this date to keep the install.' }),
      TODAY,
    );
    expect(sentence).toBe(`Was due ${day('2026-10-02')}. Order a substitute by this date to keep the install.`);
    expect(passed).toBe(true);
  });

  it.each([
    ['damage', 'The clock starts once the delivery is recorded.'],
    ['concealed_damage', 'The clock starts once the delivery is recorded.'],
    ['short_ship', 'The clock starts once the delivery is recorded.'],
    ['wrong_item', 'The clock starts once the delivery is recorded.'],
    ['ack_discrepancy', 'No clock recorded. Answer the maker in the acknowledgment.'],
    ['delay', 'No clock. A delay is kept for the record.'],
    ['backorder', 'No order-by date. The schedule sets none for this piece.'],
    ['discontinued', 'No clock. Choose a substitute or cancel.'],
    ['price_change', 'No clock. A higher price on a signed line is a change order.'],
  ])('%s with no clock says so in words', (type, sentence) => {
    expect(exceptionClockSentence(exc({ type }), TODAY)).toEqual({ sentence, passed: false });
  });
});

describe('resolution paths — the type table and the args each sends', () => {
  it('offers the type table’s paths', () => {
    const paths = (type: string) => pathsFor(exc({ type })).map((p) => p.path);
    expect(paths('damage')).toEqual(['repair', 'replace', 'credit', 'accept']);
    expect(paths('concealed_damage')).toEqual(['repair', 'replace', 'credit', 'accept']);
    expect(paths('short_ship')).toEqual(['reship', 'credit', 'accept']);
    expect(paths('wrong_item')).toEqual(['reship', 'credit', 'accept']);
    expect(paths('ack_discrepancy')).toEqual([]);
    expect(paths('delay')).toEqual(['accept']);
    expect(paths('backorder')).toEqual(['wait', 'substitute', 'cancel']);
    expect(paths('discontinued')).toEqual(['substitute', 'cancel']);
    expect(paths('price_change')).toEqual(['accept', 'substitute', 'cancel']);
  });

  it('drops PO-changing paths with no PO, and substitution with no line', () => {
    expect(pathsFor(exc({ type: 'damage', purchase_order_id: null })).map((p) => p.path)).toEqual(['accept']);
    expect(pathsFor(exc({ type: 'backorder', ffe_item_id: null })).map((p) => p.path)).toEqual(['wait', 'cancel']);
  });

  it('repair sends a remedy change, then resolves with the path', () => {
    const repair = RESOLUTION_PATHS.damage.find((p) => p.path === 'repair')!;
    expect(resolutionPlan({ exception: exc(), option: repair, reason: '  Leg cracked on arrival  ' })).toEqual({
      change: {
        purchaseOrderId: 'po-1',
        projectId: 'p1',
        changeKind: 'remedy',
        reason: 'Leg cracked on arrival',
        selectionId: 'item-1',
      },
      resolve: { status: 'resolved', resolutionPath: 'repair', note: 'Leg cracked on arrival' },
    });
  });

  it('credit and cancel carry their change kinds; accept and wait send none', () => {
    const plan = (type: string, path: string) =>
      resolutionPlan({
        exception: exc({ type }),
        option: RESOLUTION_PATHS[type as keyof typeof RESOLUTION_PATHS].find((p) => p.path === path)!,
        reason: '',
      });
    expect(plan('short_ship', 'credit').change?.changeKind).toBe('credit');
    expect(plan('backorder', 'cancel').change?.changeKind).toBe('cancellation');
    expect(plan('damage', 'accept')).toEqual({
      change: null,
      resolve: { status: 'resolved', resolutionPath: 'accept', note: null },
    });
    expect(plan('backorder', 'wait').change).toBeNull();
  });

  it('R8: a signed line holds price-bearing paths and accepting a higher price', () => {
    const signed = {
      track: 'authorized',
      number: 12,
      signedLineTotalCents: 100_000,
      depositClear: true,
      deltaCents: null,
    } as LineAuthorization;
    const credit = RESOLUTION_PATHS.damage.find((p) => p.path === 'credit')!;
    const accept = RESOLUTION_PATHS.price_change.find((p) => p.path === 'accept')!;
    const cancel = RESOLUTION_PATHS.backorder.find((p) => p.path === 'cancel')!;
    expect(pathGate('damage', credit, signed).held).toBe(true);
    expect(pathGate('price_change', accept, signed).held).toBe(true);
    expect(pathGate('backorder', cancel, signed).held).toBe(false);
    expect(pathGate('damage', credit, { track: 'none' }).held).toBe(false);
  });

  it('a change_order_required refusal reads as a change order', () => {
    expect(
      changeOrderMessage(
        'Failed to start a change on purchase_order po-1: change_order_required: the line is signed',
      ),
    ).toBe('This needs a change order the client approves first — the line is signed.');
  });
});

describe('the substitution chain', () => {
  const original: SubstituteLine = {
    id: 'item-1',
    name: 'Walnut console',
    design_disposition: 'selected',
    product_id: 'prod-1',
    assignment_scope: 'room',
    project_room_id: 'room-1',
  };
  const alt: SubstituteLine = {
    id: 'alt-1',
    name: 'Oak console',
    design_disposition: 'alternate',
    product_id: 'prod-2',
    unit_price_cents: 180_000,
    trade_price_cents: 120_000,
    assignment_scope: 'throughout',
  };
  const lines = [original, alt, { id: 'gone', name: 'Old', design_disposition: 'alternate', removed_at: 'x' }];
  const decision = (status: string, selected: 'original' | 'alt' | null = null): SubstitutionDecision => ({
    id: 'dec-1',
    status,
    options: [
      { id: 'o0', name: 'Walnut console', selected: selected === 'original', sort_order: 0, product_id: 'prod-1' },
      { id: 'o1', name: 'Oak console', selected: selected === 'alt', sort_order: 1, product_id: 'prod-2' },
    ],
  });
  const base = exc({ type: 'discontinued', status: 'awaiting_client', client_decision_id: 'dec-1' });

  it('offers only live alternate lines', () => {
    expect(alternateCandidates(lines, 'item-1').map((l) => l.id)).toEqual(['alt-1']);
  });

  it('walks pick → release → with the client → chosen → order → close', () => {
    expect(substitutionStage({ exception: exc({ type: 'discontinued' }), decision: null, lines })).toEqual({ stage: 'pick' });
    expect(substitutionStage({ exception: base, decision: undefined, lines })).toEqual({ stage: 'loading' });
    expect(substitutionStage({ exception: base, decision: decision('draft'), lines })).toEqual({ stage: 'release', decisionId: 'dec-1' });
    expect(substitutionStage({ exception: base, decision: decision('pending'), lines })).toEqual({ stage: 'with_client', decisionId: 'dec-1' });
    expect(substitutionStage({ exception: base, decision: decision('responded', 'alt'), lines })).toEqual({ stage: 'chosen', alternate: alt });
    const changed = { ...base, status: 'awaiting_vendor', po_change_id: 'chg-1' };
    const swapped = [{ ...original, design_disposition: 'not_selected' }, { ...alt, design_disposition: 'selected' }];
    expect(substitutionStage({ exception: changed, decision: decision('responded', 'alt'), lines: swapped })).toEqual({
      stage: 'order',
      alternate: swapped[1],
    });
    const ordered = [swapped[0], { ...swapped[1], purchase_order_id: 'po-2' }];
    expect(substitutionStage({ exception: changed, decision: decision('responded', 'alt'), lines: ordered })).toEqual({
      stage: 'close',
      alternate: ordered[1],
      replacementPoId: 'po-2',
    });
  });

  it('reads a kept original, an expired ask, and an unmatched choice', () => {
    expect(substitutionStage({ exception: base, decision: decision('responded', 'original'), lines })).toEqual({ stage: 'kept' });
    expect(substitutionStage({ exception: base, decision: decision('expired'), lines })).toEqual({ stage: 'expired', decisionId: 'dec-1' });
    expect(substitutionStage({ exception: base, decision: decision('responded', 'alt'), lines: [original] })).toEqual({
      stage: 'unmatched',
      optionName: 'Oak console',
    });
  });

  it('"Make the change" cancels the original, swaps the lines, records the refund negative-side, and waits on the maker', () => {
    expect(
      substitutionChangePlan({ exception: base, original, alternate: alt, moneyBack: { kind: 'refund', amountCents: 50_000 } }),
    ).toEqual({
      change: {
        purchaseOrderId: 'po-1',
        projectId: 'p1',
        changeKind: 'cancellation',
        reason: 'The client chose Oak console in place of Walnut console.',
        selectionId: 'item-1',
      },
      triage: [
        { projectId: 'p1', selectionIds: ['alt-1'], assignmentScope: 'throughout', roomId: null, disposition: 'selected' },
        { projectId: 'p1', selectionIds: ['item-1'], assignmentScope: 'room', roomId: 'room-1', disposition: 'not_selected' },
      ],
      refund: { purchaseOrderId: 'po-1', request: { kind: 'refund', amountCents: 50_000 } },
      resolve: { status: 'awaiting_vendor', note: 'The client chose Oak console in place of Walnut console.' },
    });
  });

  it('sends no change or refund for a line not yet ordered, nor a zero refund', () => {
    const plan = substitutionChangePlan({
      exception: { ...base, purchase_order_id: null },
      original,
      alternate: alt,
      moneyBack: { kind: 'credit', amountCents: 10 },
    });
    expect(plan.change).toBeNull();
    expect(plan.refund).toBeNull();
    expect(
      substitutionChangePlan({ exception: base, original, alternate: alt, moneyBack: { kind: 'credit', amountCents: 0 } }).refund,
    ).toBeNull();
  });

  it('closes against the replacement PO', () => {
    expect(substitutionClose('po-2')).toEqual({
      status: 'resolved',
      resolutionPath: 'substitute',
      replacementPurchaseOrderId: 'po-2',
    });
  });
});

describe('R5 — a below-trade alternate is allowed, with a warning', () => {
  const below: SubstituteLine = {
    id: 'alt-2',
    name: 'Ash console',
    unit_price_cents: 90_000,
    trade_price_cents: 100_000,
  };

  it('prints the negative markup and the warning to a member who sees margin', () => {
    const reading = alternateReading(below, true);
    expect(reading.markup).toMatch(/^-10% markup$|^−10% markup$/);
    expect(reading.warning).toBe(
      'Below trade: the client price is under what the studio pays for Ash console. Offering it is allowed.',
    );
  });

  it('carries no warning at or above trade', () => {
    expect(alternateReading({ ...below, unit_price_cents: 150_000 }, true).warning).toBeNull();
  });

  it('shows only the client price to a member who cannot see margin', () => {
    const reading = alternateReading(below, false);
    expect(reading.price).not.toBeNull();
    expect(reading.markup).toBeNull();
    expect(reading.warning).toBeNull();
  });
});

describe('the maker lane and the line filter', () => {
  it('reads one line and no money', () => {
    expect(makerLaneLine('damage')).toBe('Damage · Patina is handling it with the maker');
    expect(makerLaneLine('damage')).not.toMatch(/\$|\d/);
  });

  it('keeps a line’s own exceptions and its PO’s unnamed ones, never resolved ones', () => {
    const rows = [
      exc({ id: 'a' }),
      exc({ id: 'b', ffe_item_id: null }),
      exc({ id: 'c', ffe_item_id: 'item-2' }),
      exc({ id: 'd', status: 'resolved' }),
      exc({ id: 'e', ffe_item_id: null, purchase_order_id: 'po-9' }),
    ];
    expect(exceptionsForLine(rows, 'item-1', 'po-1').map((e) => e.id)).toEqual(['a', 'b']);
  });
});
