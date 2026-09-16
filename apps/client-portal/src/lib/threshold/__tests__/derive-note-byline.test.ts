import { deriveThreshold } from '../derive';

const BASE = {
  rooms: [],
  selections: null,
  proposals: { signatureGates: [], instrumentReceipts: [] },
  invoices: [],
  approvals: [],
  previousReadAt: null,
  today: new Date('2026-09-09T00:00:00.000Z'),
};

it('carries the frozen byline onto the standing note', () => {
  const model = deriveThreshold({
    ...BASE,
    notes: [
      {
        id: 'n1',
        body: 'Dave — the drawings are in.',
        state: 'standing' as const,
        sentAt: '2026-09-08T14:00:00.000Z',
        retiredAt: null,
        enclosures: [],
        byline: 'Leah Hartwell · Middle West Studio · 8 September',
      },
    ],
  });
  expect(model.note?.byline).toBe('Leah Hartwell · Middle West Studio · 8 September');
});

it('leaves the byline undefined for a note that never carried one', () => {
  const model = deriveThreshold({
    ...BASE,
    notes: [
      {
        id: 'n1',
        body: 'A later note.',
        state: 'standing' as const,
        sentAt: '2026-09-08T14:00:00.000Z',
        retiredAt: null,
        enclosures: [],
      },
    ],
  });
  expect(model.note?.byline ?? null).toBeNull();
});
