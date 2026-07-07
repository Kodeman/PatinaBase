/**
 * Reassign Vendor dialog — the PO guard split (Wave 0B, B-07).
 *
 * Pins the load-bearing rule: a PO-linked line NEVER reaches the reassign
 * write; it is surfaced per-item as skipped instead. (The mutation re-guards
 * server-side — useBulkReassignFfeVendor's vitest suite covers that leg.)
 */
import { splitReassignable } from '../reassign-vendor-dialog';

describe('splitReassignable', () => {
  it('routes PO-linked lines to skipped, the rest to reassignable', () => {
    const items = [
      { id: 'a', purchase_order_id: null },
      { id: 'b', purchase_order_id: 'po-1' },
      { id: 'c' }, // column absent — treated as unordered
      { id: 'd', purchase_order_id: 'po-2' },
    ];
    const { reassignable, skipped } = splitReassignable(items);
    expect(reassignable.map((i) => i.id)).toEqual(['a', 'c']);
    expect(skipped.map((i) => i.id)).toEqual(['b', 'd']);
  });

  it('keeps whole selections intact when nothing is ordered', () => {
    const { reassignable, skipped } = splitReassignable([
      { id: 'a', purchase_order_id: null },
      { id: 'b', purchase_order_id: undefined },
    ]);
    expect(reassignable).toHaveLength(2);
    expect(skipped).toHaveLength(0);
  });

  it('handles an all-ordered selection (confirm has nothing to write)', () => {
    const { reassignable, skipped } = splitReassignable([
      { id: 'a', purchase_order_id: 'po-1' },
    ]);
    expect(reassignable).toHaveLength(0);
    expect(skipped).toHaveLength(1);
  });
});
