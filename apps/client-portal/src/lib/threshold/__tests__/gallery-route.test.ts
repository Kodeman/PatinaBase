import { galleryRoute } from '../gallery-route';

describe('Gallery permanent addresses', () => {
  it.each(['doorstep', 'ledger', 'letterbox', 'approvals', 'door', 'wall', 'approval-decision-1', 'door-paper-1', 'review-r1', 'scope-change-s1', 'invoice-inv-1-toggle'])(
    'opens the asks drawer for #%s', (anchor) => {
      expect(galleryRoute(`#${anchor}`)).toEqual({ kind: 'asks', anchor, receipt: false });
    },
  );
  it.each(['letterbox', 'road'])('opens a checkout return at #%s with a receipt, never a scroll', (anchor) => {
    expect(galleryRoute(`#${anchor}`, { outcome: 'settled', invoiceId: 'inv-1', orderId: null }))
      .toEqual({ kind: 'asks', anchor: 'letterbox', receipt: true });
  });
  it.each(['note', 'road', 'previously', 'mat', 'write-back', 'room-living'])(
    'preserves the #%s scroll address without a checkout return', (anchor) => {
      expect(galleryRoute(`#${anchor}`)).toEqual({ kind: 'scroll', anchor });
    },
  );
  it('keeps the plan and documents reachable at their retired-route anchors', () => {
    expect(galleryRoute('#key')).toEqual({ kind: 'plan' });
    expect(galleryRoute('#mat-papers')).toEqual({ kind: 'documents' });
    expect(galleryRoute('#menu')).toEqual({ kind: 'menu' });
  });
  it('does not throw on a malformed fragment or invent a destination', () => {
    expect(galleryRoute('#%E0%A4')).toEqual({ kind: 'page' });
    expect(galleryRoute('')).toEqual({ kind: 'page' });
  });
});
