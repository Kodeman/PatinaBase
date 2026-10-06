import { deriveNextAct } from '../next-act';

const base = {
  itemStatus: 'specified',
  po: null,
  ready: false,
  inspected: false,
  hasOpenClaim: false,
};

const sent = '2026-10-01T12:00:00Z';
const acked = '2026-10-02T12:00:00Z';

describe('deriveNextAct — the one act lifted above the cells (C-14)', () => {
  it('offers Order on a ready line with no purchase order', () => {
    expect(deriveNextAct({ ...base, ready: true })).toEqual({ kind: 'order' });
  });

  it('offers nothing on a line the readiness rule holds back', () => {
    expect(deriveNextAct(base)).toBeNull();
  });

  it('offers Send on a drafted, never-sent PO', () => {
    expect(
      deriveNextAct({ ...base, itemStatus: 'ordered', po: { status: 'draft' } }),
    ).toEqual({ kind: 'send' });
  });

  it('offers Log the ack on a sent, unacknowledged PO', () => {
    expect(
      deriveNextAct({
        ...base,
        itemStatus: 'ordered',
        po: { status: 'sent', sent_at: sent, acknowledged_at: null },
      }),
    ).toEqual({ kind: 'log-ack' });
  });

  it('puts the ack ahead of a status move the PO could also take', () => {
    expect(
      deriveNextAct({
        ...base,
        itemStatus: 'ordered',
        po: { status: 'confirmed', sent_at: sent, acknowledged_at: null },
      }),
    ).toEqual({ kind: 'log-ack' });
  });

  it.each([
    ['a Patina catalog PO', { is_patina_catalog: true }],
    ['a cancelled PO', { status: 'cancelled' }],
  ])('never asks for the ack on %s', (_label, over) => {
    expect(
      deriveNextAct({
        ...base,
        itemStatus: 'ordered',
        po: { status: 'sent', sent_at: sent, acknowledged_at: null, ...over },
      }),
    ).toBeNull();
  });

  it('offers Mark in production on an acknowledged, confirmed PO', () => {
    expect(
      deriveNextAct({
        ...base,
        itemStatus: 'ordered',
        po: { status: 'confirmed', sent_at: sent, acknowledged_at: acked },
      }),
    ).toEqual({ kind: 'advance', to: 'in_production', label: 'Mark in production' });
  });

  it('offers Mark shipped on a PO in production', () => {
    expect(
      deriveNextAct({
        ...base,
        itemStatus: 'production',
        po: { status: 'in_production', sent_at: sent, acknowledged_at: acked },
      }),
    ).toEqual({ kind: 'advance', to: 'shipped', label: 'Mark shipped' });
  });

  it('offers Log inspection on a shipped line', () => {
    expect(
      deriveNextAct({
        ...base,
        itemStatus: 'shipped',
        po: { status: 'shipped', sent_at: sent, acknowledged_at: acked },
      }),
    ).toEqual({ kind: 'inspect' });
  });

  it('offers Log inspection on a delivered line not yet inspected', () => {
    expect(
      deriveNextAct({
        ...base,
        itemStatus: 'delivered',
        po: { status: 'delivered', sent_at: sent, acknowledged_at: acked },
      }),
    ).toEqual({ kind: 'inspect' });
  });

  it('offers Mark installed on a delivered, inspected line', () => {
    expect(
      deriveNextAct({
        ...base,
        itemStatus: 'delivered',
        inspected: true,
        po: { status: 'delivered', sent_at: sent, acknowledged_at: acked },
      }),
    ).toEqual({ kind: 'install' });
  });

  it('offers Mark installed on a delivered line with no PO behind it', () => {
    expect(deriveNextAct({ ...base, itemStatus: 'delivered' })).toEqual({
      kind: 'install',
    });
  });

  it('leaves the lead to the claim acts while a claim is open', () => {
    expect(
      deriveNextAct({
        ...base,
        itemStatus: 'delivered',
        inspected: true,
        hasOpenClaim: true,
        po: { status: 'delivered', sent_at: sent, acknowledged_at: acked },
      }),
    ).toBeNull();
  });

  it('offers nothing on an installed line', () => {
    expect(
      deriveNextAct({
        ...base,
        itemStatus: 'installed',
        inspected: true,
        po: { status: 'delivered', sent_at: sent, acknowledged_at: acked },
      }),
    ).toBeNull();
  });
});
