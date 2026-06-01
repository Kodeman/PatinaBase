/**
 * Unit tests for the Decision-Framework integrity helpers (PT-D-2-T3).
 *
 * Covers the pure logic that drives both the order-control gate (T3-1) and the
 * "N items blocked" rollup (T3-2):
 *   - getBlockedItems: only items with BOTH blocked + blocked_by_decision_id
 *   - distinctBlockingDecisionIds: dedupes the decision FKs
 *   - blockedDecisionHref: single-decision deep link vs list fallback
 *
 * The helpers are JSX-free, so this imports them directly from the component
 * module without rendering anything.
 */
import {
  getBlockedItems,
  distinctBlockingDecisionIds,
  blockedDecisionHref,
  type BlockableFFEItem,
} from '../blocked-by-decision-notice';

const DEC_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const DEC_B = 'bbbbbbbb-0000-0000-0000-000000000002';

function item(overrides: Partial<BlockableFFEItem> & { id: string }): BlockableFFEItem {
  return {
    name: 'Sofa',
    blocked: false,
    blocked_by_decision_id: null,
    blocked_reason: null,
    ...overrides,
  };
}

describe('getBlockedItems', () => {
  it('returns only items that are blocked AND carry a decision id', () => {
    const items = [
      item({ id: '1', blocked: true, blocked_by_decision_id: DEC_A }),
      item({ id: '2', blocked: false, blocked_by_decision_id: DEC_A }), // not blocked
      item({ id: '3', blocked: true, blocked_by_decision_id: null }), // stale flag, no decision
      item({ id: '4' }), // orderable
    ];
    const blocked = getBlockedItems(items);
    expect(blocked.map((i) => i.id)).toEqual(['1']);
  });

  it('treats a blocked flag with no decision link as orderable (half-cleared row)', () => {
    const items = [item({ id: '1', blocked: true, blocked_by_decision_id: null })];
    expect(getBlockedItems(items)).toHaveLength(0);
  });

  it('returns an empty array when nothing is blocked', () => {
    expect(getBlockedItems([item({ id: '1' }), item({ id: '2' })])).toEqual([]);
  });
});

describe('distinctBlockingDecisionIds', () => {
  it('dedupes decision ids across items', () => {
    const items = [
      item({ id: '1', blocked: true, blocked_by_decision_id: DEC_A }),
      item({ id: '2', blocked: true, blocked_by_decision_id: DEC_A }),
      item({ id: '3', blocked: true, blocked_by_decision_id: DEC_B }),
    ];
    expect(distinctBlockingDecisionIds(items).sort()).toEqual([DEC_A, DEC_B].sort());
  });

  it('ignores items without a decision id', () => {
    const items = [
      item({ id: '1', blocked: true, blocked_by_decision_id: null }),
      item({ id: '2', blocked: true, blocked_by_decision_id: DEC_A }),
    ];
    expect(distinctBlockingDecisionIds(items)).toEqual([DEC_A]);
  });
});

describe('blockedDecisionHref', () => {
  it('deep-links to the single blocking decision', () => {
    const items = [
      item({ id: '1', blocked: true, blocked_by_decision_id: DEC_A }),
      item({ id: '2', blocked: true, blocked_by_decision_id: DEC_A }),
    ];
    expect(blockedDecisionHref(items)).toEqual({
      href: `/portal/decisions/${DEC_A}`,
      isSingle: true,
    });
  });

  it('falls back to the decisions list when multiple decisions block items', () => {
    const items = [
      item({ id: '1', blocked: true, blocked_by_decision_id: DEC_A }),
      item({ id: '2', blocked: true, blocked_by_decision_id: DEC_B }),
    ];
    expect(blockedDecisionHref(items)).toEqual({
      href: '/portal/decisions',
      isSingle: false,
    });
  });

  it('falls back to the list when there is no decision id at all', () => {
    expect(blockedDecisionHref([])).toEqual({
      href: '/portal/decisions',
      isSingle: false,
    });
  });
});
