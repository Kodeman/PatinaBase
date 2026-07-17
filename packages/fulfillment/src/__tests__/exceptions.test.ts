import { describe, it, expect } from 'vitest';
import {
  RESOLUTION_PATHS_BY_TYPE,
  RESOLUTION_PATH_META,
  resolutionPathsForType,
  EXCEPTION_CAUSE_CODES,
  EXCEPTION_TYPE_LABELS,
  ledgerLineParts,
  consequenceIsEmpty,
  consequenceLedgerStrip,
  sortExceptionsByClock,
  type ConsequencePreview,
  type ExceptionListRow,
  type LedgerLinePreview,
} from '../exceptions';
import type { ExceptionType } from '../types';

const ALL_TYPES: ExceptionType[] = [
  'damage', 'delay', 'backorder', 'substitution', 'loss', 'client_change', 'cancellation', 'return',
];

describe('resolution path catalog', () => {
  it('every exception type maps to at least one path, and every path has meta', () => {
    for (const t of ALL_TYPES) {
      const paths = RESOLUTION_PATHS_BY_TYPE[t];
      expect(paths.length).toBeGreaterThan(0);
      for (const p of paths) expect(RESOLUTION_PATH_META[p]).toBeDefined();
    }
  });

  it('damage offers the three T5 outcomes; substitution routes to Leah', () => {
    expect(RESOLUTION_PATHS_BY_TYPE.damage).toEqual([
      'damage_vendor_claim', 'damage_client_credit', 'damage_recovery',
    ]);
    expect(RESOLUTION_PATH_META.substitution_review.requiresLeah).toBe(true);
    expect(resolutionPathsForType('substitution')).toHaveLength(1);
  });

  it('financial paths are exactly the ledger-posting ones', () => {
    const financial = Object.values(RESOLUTION_PATH_META).filter((m) => m.financial).map((m) => m.path).sort();
    expect(financial).toEqual(
      ['damage_client_credit', 'damage_recovery', 'damage_vendor_claim', 'refund'].sort(),
    );
  });

  it('EXCEPTION_TYPE_LABELS and cause codes are complete/non-empty', () => {
    for (const t of ALL_TYPES) expect(EXCEPTION_TYPE_LABELS[t]).toBeTruthy();
    expect(EXCEPTION_CAUSE_CODES.length).toBeGreaterThan(3);
    for (const c of EXCEPTION_CAUSE_CODES) expect(c.value && c.label).toBeTruthy();
  });
});

describe('ledger line formatting', () => {
  const dr: LedgerLinePreview = { accountCode: '1100', accountName: 'Claims Receivable', debitCents: 118000, creditCents: 0 };
  const cr: LedgerLinePreview = { accountCode: '5200', accountName: 'Damage & Claims', debitCents: 0, creditCents: 118000 };

  it('ledgerLineParts picks the non-zero side', () => {
    expect(ledgerLineParts(dr)).toMatchObject({ code: '1100', side: 'Dr', amount: '$1,180.00' });
    expect(ledgerLineParts(cr)).toMatchObject({ code: '5200', side: 'Cr', amount: '$1,180.00' });
  });

  it('consequenceIsEmpty and consequenceLedgerStrip honour the $0 case', () => {
    const empty: ConsequencePreview = {
      path: 'delay_redate', financial: false, requiresLeah: false, template: null,
      outcome: null, amountCents: null, lineAction: 'redate_eta', lines: [], summary: 'x',
    };
    expect(consequenceIsEmpty(empty)).toBe(true);
    expect(consequenceLedgerStrip(empty)).toContain('$0');

    const financial: ConsequencePreview = {
      path: 'damage_vendor_claim', financial: true, requiresLeah: false, template: 'T5',
      outcome: 'claim', amountCents: 118000, lineAction: null, lines: [dr, cr], summary: 'x',
    };
    expect(consequenceIsEmpty(financial)).toBe(false);
    expect(consequenceLedgerStrip(financial)).toContain('Claims Receivable Dr $1,180.00');
  });
});

describe('sortExceptionsByClock', () => {
  const row = (over: Partial<ExceptionListRow>): ExceptionListRow => ({
    id: 'x', type: 'damage', status: 'open', orderId: null, orderNo: null,
    clientName: null, itemName: null, poNumber: null, clockDueAt: null, openedAt: '2026-07-17T00:00:00Z',
    ...over,
  });

  it('soonest clock first, nulls last, resolved after open', () => {
    const soon = row({ id: 'soon', clockDueAt: '2026-07-18T00:00:00Z' });
    const later = row({ id: 'later', clockDueAt: '2026-07-25T00:00:00Z' });
    const noClock = row({ id: 'noclock', clockDueAt: null });
    const resolved = row({ id: 'resolved', status: 'resolved', clockDueAt: '2026-07-17T12:00:00Z' });

    const sorted = sortExceptionsByClock([resolved, noClock, later, soon]).map((r) => r.id);
    expect(sorted).toEqual(['soon', 'later', 'noclock', 'resolved']);
  });
});
