import { composeDeskRead } from '../use-desk-engagements';
import { scopeDeskNeeds } from '@/lib/document/desk-scope';
import { type DocumentStateRow } from '@/lib/document/desk-derivation';
import { fetchReleasedPurchaseOrders, type ReleasedPurchaseOrder } from '@patina/supabase';
import { deriveDaySheet } from '@/lib/document/day-sheet';
import { deriveNeeds } from '@/lib/document/desk-derivation';

const leads = new Map([['project-1', { leadUserId: 'owner', leadName: 'Leah', previousLeadUserId: null, previousLeadName: null, assignedAt: null }]]);
const designers = new Map([['project-1', 'owner']]);
function sheet(entries: ReturnType<typeof needs>, meUserId: string, scope: 'mine' | 'studio' = 'mine') {
  return deriveDaySheet({ needs: entries, states: new Map(), leads, designers, meUserId, scope,
    unreadFeeds: [], now, teammateActs: new Map([['po_unsent:po-1', [{ userId: 'owner', actedAt: '2026-10-22T11:00:00Z' }]]]) });
}

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
function needs(releases: ReleasedPurchaseOrder[] = [release]) {
  const result = composeDeskRead({}, [row], '2026-10-22', now, undefined, releases);
  return result.folders.flatMap((folder) => folder.needs.map((need) => ({
    key: need.key, projectId: 'project-1', projectName: 'The house', need,
  })));
}

describe('P-03 release custody', () => {
  it('keeps Review and send open on the buyer and studio sheets after the owner approved release', () => {
    for (const scope of ['mine', 'studio'] as const) {
      const result = sheet(needs(), 'buyer', scope);
      expect(result.lines.find((entry) => entry.need.releasedOrder)?.settled).toBeUndefined();
      expect(result.lines.some((entry) => entry.need.releasedOrder)).toBe(true);
      expect(result.waitingOn).toEqual([]);
    }
  });
  it('uses the releaser display name when their full name is blank', () => {
    const entries = needs([{ ...release, released_by_profile: { full_name: '', display_name: 'Leah Strand' } }]);
    expect(entries.find((entry) => entry.need.releasedOrder)?.need.text).toBe('Released by Leah · not sent');
  });
  it('routes claim and inbound drafts separately to each PO buyer, not the project lead', () => {
    const drafts = [
      { id: 'claim', project_id: 'project-1', purchase_order_id: 'po-1', kind: 'vendor_claim_notice', status: 'awaiting_review', created_at: '2026-10-22' },
      { id: 'inbound', project_id: 'project-1', purchase_order_id: 'po-2', kind: 'receiver_inbound_notice', status: 'awaiting_review', created_at: '2026-10-22' },
    ];
    const orders = [{ ...release, released_at: '', sent_at: '2026-10-21' }, { ...release, id: 'po-2', created_by: 'other', released_at: '', sent_at: '2026-10-21' }];
    const result = composeDeskRead({ drafts }, [{ ...row, draft_unsent_po_count: 0 }], '2026-10-22', now, undefined, orders);
    const entries = result.folders.flatMap((folder) => folder.needs.map((need) => ({ key: need.key, projectId: 'project-1', projectName: 'The house', need })));
    expect(sheet(entries, 'buyer').lines.map((entry) => entry.need.draft?.id)).toEqual(['claim']);
    expect(sheet(entries, 'other').lines.map((entry) => entry.need.draft?.id)).toEqual(['inbound']);
    expect(sheet(entries, 'owner').lines).toEqual([]);
    expect(sheet(entries, 'buyer', 'studio').lines).toHaveLength(2);
  });
  it('does not let the project lead settle a buyer-owned draft', () => {
    const [need] = deriveNeeds({ ...row, draft_unsent_po_count: 0 }, now, null, null, null, null, null, null, null, null,
      [{ id: 'claim', kind: 'vendor_claim_notice', status: 'awaiting_review', created_at: '2026-10-22', to_email: null, subject: '', body: '', assignedToUserId: 'buyer' }]);
    const entry = { key: need.key, projectId: 'project-1', projectName: 'The house', need };
    const result = deriveDaySheet({ needs: [entry], states: new Map(), leads, designers, meUserId: 'buyer', scope: 'mine', unreadFeeds: [], now,
      teammateActs: new Map([[need.key, [{ userId: 'owner', actedAt: '2026-10-22T11:00:00Z' }]]]) });
    expect(result.lines[0]).toEqual(expect.objectContaining({ need: expect.objectContaining({ assignedToUserId: 'buyer' }) }));
    expect(result.lines[0]?.settled).toBeUndefined();
  });
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
    ['confirmed', { status: 'confirmed' }],
    ['in production', { status: 'in_production' }],
    ['shipped', { status: 'shipped' }],
    ['delivered', { status: 'delivered' }],
    ['unreleased', { released_at: '' }],
    ['unassigned', { created_by: '' }],
  ])('does not hand back a %s PO', (_name, change) => {
    expect(needs([{ ...release, ...change }]).some((entry) => entry.need.releasedOrder)).toBe(false);
  });
  it('reads existing release and buyer facts without changing the database', async () => {
    const query = { select: jest.fn().mockReturnThis(), not: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(), neq: jest.fn().mockReturnThis(), in: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({ data: [release], error: null }) };
    const from = jest.fn().mockReturnValue(query);
    expect(await fetchReleasedPurchaseOrders({ from })).toEqual([release]);
    expect(from).toHaveBeenCalledWith('purchase_orders');
    expect(query.select).toHaveBeenCalledWith(expect.stringContaining('created_by, released_at'));
    expect(query.select).toHaveBeenCalledWith(expect.stringContaining('purchase_orders_released_by_fkey'));
    expect(query.is).toHaveBeenCalledWith('sent_at', null);
    expect(query.in).toHaveBeenCalledWith('status', ['draft', 'held_for_release']);
  });
});
