import { isCommittedBuyingLine, purchaseOrderFoot } from '../buying-readings';
import { lineStampLabel } from '../stamp-derivation';

describe('vendor-reached buying facts', () => {
  it.each(['confirmed', 'in_production', 'shipped', 'delivered'])('counts %s without sent_at as committed', (status) => {
    expect(isCommittedBuyingLine({ purchase_order: { status } })).toBe(true);
    expect(purchaseOrderFoot({ status })).toContain('Confirmed by vendor');
  });
  it('preserves sends, cancellation, drafts and recorded purchases', () => {
    expect(isCommittedBuyingLine({ purchase_order: { sent_at: '2026-10-01' } })).toBe(true);
    expect(purchaseOrderFoot({ status: 'confirmed', sent_at: '2026-10-01' })).toContain('Sent to vendor');
    for (const status of ['draft', 'held_for_release', 'cancelled']) {
      expect(isCommittedBuyingLine({ purchase_order: { status } })).toBe(false);
    }
    expect(isCommittedBuyingLine({ purchase_order: { status: 'cancelled', sent_at: '2026-10-01' } })).toBe(false);
    expect(isCommittedBuyingLine({ studio_purchases: [{ status: 'recorded' }] })).toBe(true);
    expect(lineStampLabel('order_sent')).toBe('Sent to vendor');
  });
});
