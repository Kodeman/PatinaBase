import { composeDeskRead } from '../use-desk-engagements';
import { scopeDeskNeeds } from '@/lib/document/desk-scope';
import { type DocumentStateRow } from '@/lib/document/desk-derivation';
import { fetchReleasedPurchaseOrders } from '@patina/supabase';

const now = new Date('2026-10-22T12:00:00Z');
const row = {
  engagement_kind: 'project', engagement_id: 'project-1', project_id: 'project-1',
  designer_id: 'owner', is_archived: false, is_paused: false,
  draft_unsent_po_count: 1, oldest_draft_po_created_at: '2026-10-01',
} as DocumentStateRow;
const release = {
  id: 'po-1', project_id: 'project-1', created_by: 'buyer', released_at: '2026-10-22T11:00:00Z',
  sent_at: null, status: 'draft', released_by_profile: { full_name: 'Leah Strand' },
};
function needs(releases = [release]) {
  const result = composeDeskRead({}, [row], '2026-10-22', now, undefined, releases);
  return result.folders.flatMap((folder) => folder.needs.map((need) => ({
    key: need.key, projectId: 'project-1', projectName: 'The house', need,
  })));
}

describe('P-03 release custody', () => {
  it('gives the buyer Review and send after release even when the owner leads the job', () => {
    const mine = scopeDeskNeeds(needs(), new Map(), 'buyer', 'mine', new Map([['project-1', 'owner']]));
    expect(mine).toEqual(expect.arrayContaining([expect.objectContaining({ need: expect.objectContaining({
      text: 'Released by Leah · not sent', actionLabel: 'Review and send', recordId: 'po-1',
    }) })]));
  });
  it('removes the released order and its stale draft aggregate from the owner’s needs', () => {
    const mine = scopeDeskNeeds(needs(), new Map(), 'owner', 'mine', new Map([['project-1', 'owner']]));
    expect(mine.filter((entry) => entry.need.kind === 'po_unsent')).toEqual([]);
  });
  it('keeps each released PO with its own buyer on a shared job', () => {
    const entries = needs([release, { ...release, id: 'po-2', created_by: 'other' }]);
    const mine = scopeDeskNeeds(entries, new Map(), 'other', 'mine');
    expect(mine.filter((entry) => entry.need.releasedOrder).map((entry) => entry.need.recordId)).toEqual(['po-2']);
  });
  it.each([
    ['sent', { sent_at: '2026-10-22T11:30:00Z' }],
    ['cancelled', { status: 'cancelled' }],
    ['unreleased', { released_at: '' }],
    ['unassigned', { created_by: '' }],
  ])('does not hand back a %s PO', (_name, change) => {
    expect(needs([{ ...release, ...change }]).some((entry) => entry.need.releasedOrder)).toBe(false);
  });
  it('reads existing release and buyer facts without changing the database', async () => {
    const query = { select: jest.fn().mockReturnThis(), not: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(), neq: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({ data: [release], error: null }) };
    const from = jest.fn().mockReturnValue(query);
    expect(await fetchReleasedPurchaseOrders({ from })).toEqual([release]);
    expect(from).toHaveBeenCalledWith('purchase_orders');
    expect(query.select).toHaveBeenCalledWith(expect.stringContaining('created_by, released_at'));
    expect(query.select).toHaveBeenCalledWith(expect.stringContaining('purchase_orders_released_by_fkey'));
    expect(query.is).toHaveBeenCalledWith('sent_at', null);
    expect(query.neq).toHaveBeenCalledWith('status', 'cancelled');
  });
});
