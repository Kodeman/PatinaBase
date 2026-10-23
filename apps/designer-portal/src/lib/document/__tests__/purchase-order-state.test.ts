import { purchaseOrderState } from '../stamp-derivation';

describe('vendor-reached purchase order state (00863)', () => {
  it('treats every vendor-acknowledged status as confirmed without inventing a send timestamp', () => {
    for (const status of ['confirmed', 'in_production', 'shipped', 'delivered']) {
      expect(purchaseOrderState({ status })).toBe('order_confirmed');
      expect(purchaseOrderState({ status, released_at: '2026-10-01' })).toBe('order_confirmed');
      expect(purchaseOrderState({ status, sent_at: '2026-10-01' })).toBe('order_sent');
    }
  });

  it('preserves cancellation and draft or held release branches', () => {
    expect(purchaseOrderState({ status: 'cancelled', sent_at: '2026-10-01' })).toBeNull();
    for (const status of ['draft', 'held_for_release']) {
      expect(purchaseOrderState({ status })).toBe('order_drafted');
      expect(purchaseOrderState({ status, released_at: '2026-10-01' })).toBe('order_released');
      expect(purchaseOrderState({ status, sent_at: '2026-10-01' })).toBe('order_sent');
    }
  });
});
