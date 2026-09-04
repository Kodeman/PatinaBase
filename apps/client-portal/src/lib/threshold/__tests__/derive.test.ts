import type { Invoice } from '@patina/supabase';

import type { ClientSelection } from '@/lib/commercial-documents';

import {
  deriveThreshold,
  type ThresholdInput,
  type ThresholdNote,
  type ThresholdProposal,
  type ThresholdRoom,
} from '../derive';

const ENTRY: ThresholdRoom = { id: 'r-ent', name: 'Entry', sortOrder: 0, floorAreaSqft: null };
const LIBRARY: ThresholdRoom = { id: 'r-lib', name: 'Library', sortOrder: 1, floorAreaSqft: null };
const STAIR: ThresholdRoom = { id: 'r-stair', name: 'Stair hall', sortOrder: 2, floorAreaSqft: null };
const ROOMS = [ENTRY, LIBRARY, STAIR];

function selection(overrides: Partial<ClientSelection> & { id: string }): ClientSelection {
  return {
    kind: 'furnishings',
    name: 'A piece',
    roomId: null,
    roomName: 'General',
    quantity: 1,
    clientUnitPriceCents: 0,
    clientLineTotalCents: 0,
    itemType: 'furniture',
    logisticsStatus: 'specified',
    tradeJourney: null,
    allowance: null,
    instrument: null,
    productId: null,
    imageUrl: null,
    docCode: null,
    ...overrides,
  };
}

function instrument(proposalId: string) {
  return { documentId: `doc-${proposalId}`, proposalId, name: 'Authorization No. 7', executedAt: null };
}

function proposal(overrides: Partial<ThresholdProposal> & { id: string }): ThresholdProposal {
  return {
    title: 'Furnishings authorization No. 7',
    totalAmountCents: 0,
    sentAt: null,
    updatedAt: null,
    ...overrides,
  };
}

function invoice(overrides: Partial<Invoice> & { id: string }): Invoice {
  return {
    status: 'sent',
    invoice_number: 'INV-4',
    due_date: null,
    total_cents: 0,
    amount_paid_cents: 0,
    updated_at: '2026-08-01T00:00:00.000Z',
    ...overrides,
  } as Invoice;
}

function note(overrides: Partial<ThresholdNote> & { id: string }): ThresholdNote {
  return {
    body: 'A line to you.',
    state: 'standing',
    sentAt: '2026-08-04T09:00:00.000Z',
    retiredAt: null,
    enclosures: [],
    ...overrides,
  };
}

function input(overrides: Partial<ThresholdInput> = {}): ThresholdInput {
  return {
    rooms: ROOMS,
    selections: { origin: 'commercial', selections: [] },
    proposals: { signatureGates: [], instrumentReceipts: [] },
    invoices: [],
    approvals: [],
    notes: [],
    previousReadAt: null,
    today: new Date(2026, 7, 5),
    ...overrides,
  };
}

describe('deriveThreshold — the house standing up', () => {
  it('bands the rooms in plan order and files each selection under its room', () => {
    const model = deriveThreshold(
      input({
        selections: {
          origin: 'commercial',
          selections: [
            selection({ id: 's-1', roomId: 'r-lib', name: 'Reading chair', clientLineTotalCents: 400_000 }),
            selection({ id: 's-2', roomId: 'r-lib', name: 'Library table', clientLineTotalCents: 289_000 }),
            selection({ id: 's-3', roomId: 'r-ent', name: 'Runner', clientLineTotalCents: 120_000 }),
          ],
        },
      }),
    );

    expect(model.bands.map((band) => band.roomId)).toEqual(['r-ent', 'r-lib', 'r-stair']);
    expect(model.bands.map((band) => band.anchor)).toEqual([
      'room-r-ent',
      'room-r-lib',
      'room-r-stair',
    ]);
    const library = model.bands.find((band) => band.roomId === 'r-lib')!;
    expect(library.pieces.map((piece) => piece.id)).toEqual(['s-1', 's-2']);
    expect(library.totalCents).toBe(689_000);
    expect(model.bands.find((band) => band.roomId === 'r-stair')!.pieces).toEqual([]);
  });

  it('is the ground floor with no rooms, and neither while the rooms are still coming', () => {
    expect(deriveThreshold(input({ rooms: [] })).groundFloor).toBe(true);
    expect(deriveThreshold(input({ rooms: [] })).pending).toBe(false);

    const waiting = deriveThreshold(input({ rooms: undefined }));
    expect(waiting.pending).toBe(true);
    expect(waiting.groundFloor).toBe(false);
    expect(deriveThreshold(input({ rooms: null })).pending).toBe(true);
    expect(deriveThreshold(input({ rooms: null })).groundFloor).toBe(false);
  });

  it('keeps silent, not broken, when the selections are not commercial in origin', () => {
    const model = deriveThreshold(
      input({
        selections: {
          origin: 'legacy',
          selections: [
            selection({ id: 's-1', roomId: 'r-lib', clientLineTotalCents: 400_000 }),
            selection({
              id: 's-2',
              kind: 'trade',
              roomId: 'r-stair',
              tradeJourney: 'substantially_complete',
              instrument: instrument('p-trade'),
            }),
          ],
        },
      }),
    );

    expect(model.bands).toHaveLength(3);
    model.bands.forEach((band) => {
      expect(band.pieces).toEqual([]);
      expect(band.totalCents).toBe(0);
    });
    expect(model.marks).toEqual([]);
    expect(model.road).toEqual([]);
    expect(model.groundFloor).toBe(false);
  });

  it('keeps silent when the selections have not arrived at all', () => {
    const model = deriveThreshold(input({ selections: null }));
    expect(model.bands.every((band) => band.pieces.length === 0)).toBe(true);
    expect(model.marks).toEqual([]);
  });
});

describe('deriveThreshold — the doors', () => {
  it('hangs a signature gate on the room holding the most of it', () => {
    const model = deriveThreshold(
      input({
        proposals: {
          signatureGates: [proposal({ id: 'p-7', totalAmountCents: 689_000 })],
          instrumentReceipts: [],
        },
        selections: {
          origin: 'commercial',
          selections: [
            selection({
              id: 's-1',
              roomId: 'r-ent',
              clientLineTotalCents: 120_000,
              instrument: instrument('p-7'),
            }),
            selection({
              id: 's-2',
              roomId: 'r-lib',
              clientLineTotalCents: 400_000,
              instrument: instrument('p-7'),
            }),
            selection({
              id: 's-3',
              roomId: 'r-lib',
              clientLineTotalCents: 169_000,
              instrument: instrument('p-7'),
            }),
          ],
        },
      }),
    );

    expect(model.marks).toHaveLength(1);
    const [mark] = model.marks;
    expect(mark.kind).toBe('door');
    expect(mark.roomId).toBe('r-lib');
    expect(mark.anchor).toBe('door');
    expect(mark.proposalId).toBe('p-7');
    expect(mark.label).toBe('Furnishings authorization No. 7');
    expect(mark.amountCents).toBe(689_000);
  });

  it('stands the door on the doorstep when nothing of it falls in a room', () => {
    const model = deriveThreshold(
      input({
        proposals: {
          signatureGates: [proposal({ id: 'p-ds', title: 'Design services agreement' })],
          instrumentReceipts: [],
        },
      }),
    );

    expect(model.marks).toHaveLength(1);
    expect(model.marks[0].roomId).toBeNull();
    expect(model.marks[0].anchor).toBe('doorstep');
    expect(model.marks[0].kind).toBe('door');
  });

  it('stands the door on the doorstep when its selections carry no room', () => {
    const model = deriveThreshold(
      input({
        proposals: { signatureGates: [proposal({ id: 'p-7' })], instrumentReceipts: [] },
        selections: {
          origin: 'commercial',
          selections: [
            selection({ id: 's-1', roomId: null, clientLineTotalCents: 400_000, instrument: instrument('p-7') }),
          ],
        },
      }),
    );

    expect(model.marks[0].roomId).toBeNull();
  });

  it('hangs one door per signature gate', () => {
    const model = deriveThreshold(
      input({
        proposals: {
          signatureGates: [proposal({ id: 'p-1' }), proposal({ id: 'p-2' })],
          instrumentReceipts: [],
        },
      }),
    );
    expect(model.marks.filter((mark) => mark.kind === 'door')).toHaveLength(2);
  });
});

describe('deriveThreshold — the walls', () => {
  const wallSelection = selection({
    id: 's-paint',
    kind: 'trade',
    name: 'Paintwork',
    roomId: 'r-stair',
    tradeJourney: 'substantially_complete',
    instrument: instrument('p-paint'),
    clientLineTotalCents: 720_000,
  });

  it('hatches a wall on the room where the finished work stands', () => {
    const model = deriveThreshold(
      input({ selections: { origin: 'commercial', selections: [wallSelection] } }),
    );

    expect(model.marks).toHaveLength(1);
    const [mark] = model.marks;
    expect(mark.kind).toBe('wall');
    expect(mark.roomId).toBe('r-stair');
    expect(mark.anchor).toBe('wall');
    expect(mark.proposalId).toBe('p-paint');
    expect(mark.label).toBe('Paintwork');
    expect(model.bands.find((band) => band.roomId === 'r-stair')!.marks).toEqual([mark]);
  });

  it('leaves trade work alone until it is substantially complete', () => {
    const model = deriveThreshold(
      input({
        selections: {
          origin: 'commercial',
          selections: [{ ...wallSelection, tradeJourney: 'in_progress' }],
        },
      }),
    );
    expect(model.marks).toEqual([]);
  });

  it('leaves trade work alone with no instrument behind it', () => {
    const model = deriveThreshold(
      input({
        selections: { origin: 'commercial', selections: [{ ...wallSelection, instrument: null }] },
      }),
    );
    expect(model.marks).toEqual([]);
  });

  it('never hatches a furnishings line', () => {
    const model = deriveThreshold(
      input({
        selections: {
          origin: 'commercial',
          selections: [{ ...wallSelection, kind: 'furnishings' }],
        },
      }),
    );
    expect(model.marks).toEqual([]);
  });
});

describe('deriveThreshold — the road', () => {
  it('carries the pieces with no room and the pieces not yet here', () => {
    const model = deriveThreshold(
      input({
        selections: {
          origin: 'commercial',
          selections: [
            selection({ id: 's-transit', roomId: 'r-lib', name: 'Credenza', logisticsStatus: 'shipped' }),
            selection({ id: 's-roomless', roomId: null, name: 'Sconces', logisticsStatus: 'delivered' }),
            selection({ id: 's-home', roomId: 'r-lib', name: 'Chair', logisticsStatus: 'installed' }),
            selection({ id: 's-here', roomId: 'r-ent', name: 'Runner', logisticsStatus: 'delivered' }),
          ],
        },
      }),
    );

    expect(model.road.map((piece) => piece.selectionId).sort()).toEqual(['s-roomless', 's-transit']);
  });

  it('never puts trade work on the road', () => {
    const model = deriveThreshold(
      input({
        selections: {
          origin: 'commercial',
          selections: [
            selection({ id: 's-trade', kind: 'trade', roomId: null, logisticsStatus: 'specified' }),
          ],
        },
      }),
    );
    expect(model.road).toEqual([]);
  });
});

describe('deriveThreshold — the ledger and the letterbox', () => {
  const soonest = invoice({
    id: 'inv-4',
    invoice_number: 'INV-4',
    due_date: '2026-08-15',
    total_cents: 1_825_000,
    amount_paid_cents: 912_500,
  });
  const later = invoice({
    id: 'inv-5',
    invoice_number: 'INV-5',
    due_date: '2026-09-15',
    total_cents: 500_000,
    amount_paid_cents: 0,
  });

  it('opens the soonest-due open invoice and owes exactly its balance', () => {
    const model = deriveThreshold(input({ invoices: [later, soonest] }));

    expect(model.letterbox?.id).toBe('inv-4');
    expect(model.letterbox?.balanceCents).toBe(912_500);
    expect(model.letterbox?.dueDate).toBe('2026-08-15');
    expect(model.ledger.owedCents).toBe(912_500);
  });

  it('ignores drafts, voids and settled invoices', () => {
    const model = deriveThreshold(
      input({
        invoices: [
          invoice({ id: 'inv-draft', status: 'draft', due_date: '2026-07-01', total_cents: 100 }),
          invoice({ id: 'inv-void', status: 'void', due_date: '2026-07-02', total_cents: 100 }),
          invoice({ id: 'inv-paid', status: 'paid', due_date: '2026-07-03', total_cents: 100 }),
          soonest,
        ],
      }),
    );
    expect(model.letterbox?.id).toBe('inv-4');
  });

  it('is silent with nothing in the letterbox', () => {
    expect(deriveThreshold(input()).letterbox).toBeNull();
    expect(deriveThreshold(input()).ledger.owedCents).toBeNull();
  });

  it('plans from the rooms that carry a target, and says nothing when none do', () => {
    expect(deriveThreshold(input()).ledger.plannedCents).toBeNull();
    const model = deriveThreshold(
      input({
        rooms: [
          { ...ENTRY, targetCents: 250_000 },
          { ...LIBRARY, targetCents: 689_000 },
          STAIR,
        ],
      }),
    );
    expect(model.ledger.plannedCents).toBe(939_000);
  });

  it('takes the agreed figure only when it is handed in', () => {
    expect(deriveThreshold(input()).ledger.agreedCents).toBeNull();
    expect(
      deriveThreshold(input({ liveAuthorizedTotalCents: 1_825_000 })).ledger.agreedCents,
    ).toBe(1_825_000);
  });

  it('holds the draw behind each wall, when the draws are handed in', () => {
    const wall = selection({
      id: 's-paint',
      kind: 'trade',
      roomId: 'r-stair',
      tradeJourney: 'substantially_complete',
      instrument: instrument('p-paint'),
    });
    expect(
      deriveThreshold(input({ selections: { origin: 'commercial', selections: [wall] } })).ledger
        .heldCents,
    ).toBeNull();
    expect(
      deriveThreshold(
        input({
          selections: { origin: 'commercial', selections: [wall] },
          heldDrawCentsByProposalId: { 'p-paint': 144_000, 'p-other': 999_999 },
        }),
      ).ledger.heldCents,
    ).toBe(144_000);
  });

  it('sums what awaits a name across the signature gates', () => {
    const model = deriveThreshold(
      input({
        proposals: {
          signatureGates: [
            proposal({ id: 'p-1', totalAmountCents: 689_000 }),
            proposal({ id: 'p-2', totalAmountCents: 311_000 }),
          ],
          instrumentReceipts: [],
        },
      }),
    );
    expect(model.ledger.awaitingCents).toBe(1_000_000);
    expect(deriveThreshold(input()).ledger.awaitingCents).toBe(0);
  });
});

describe('deriveThreshold — the note and what came before', () => {
  it('takes the first standing note and nothing else', () => {
    const model = deriveThreshold(
      input({
        notes: [
          note({ id: 'n-retired', state: 'retired', retiredAt: '2026-07-01T00:00:00.000Z' }),
          note({ id: 'n-standing', body: 'Three last pieces for the library.' }),
          note({ id: 'n-second', body: 'And another.' }),
        ],
      }),
    );
    expect(model.note?.id).toBe('n-standing');
    expect(model.note?.body).toBe('Three last pieces for the library.');
    expect(deriveThreshold(input()).note).toBeNull();
  });

  it('files retired notes and accepted instruments behind the client, newest first', () => {
    const model = deriveThreshold(
      input({
        notes: [
          note({
            id: 'n-old',
            body: 'An older line.',
            state: 'retired',
            retiredAt: '2026-06-01T00:00:00.000Z',
          }),
          note({
            id: 'n-new',
            body: 'A newer line.',
            state: 'retired',
            retiredAt: '2026-07-20T00:00:00.000Z',
          }),
          note({ id: 'n-standing' }),
        ],
        proposals: {
          signatureGates: [],
          instrumentReceipts: [
            { id: 'r-1', label: 'Fourteen selections agreed', date: '2026-06-19T00:00:00.000Z' },
          ],
        },
      }),
    );

    expect(model.previously.map((entry) => entry.id)).toEqual(['n-new', 'r-1', 'n-old']);
    expect(model.previously.map((entry) => entry.kind)).toEqual(['note', 'instrument', 'note']);
    expect(model.previously[1].label).toBe('Fourteen selections agreed');
    expect(model.previously[1].date).toEqual(new Date('2026-06-19T00:00:00.000Z'));
  });
});

describe('deriveThreshold — what moved since the client last read', () => {
  const PREVIOUS = '2026-08-04T12:00:00.000Z';
  const AFTER = '2026-08-05T09:00:00.000Z';
  const BEFORE = '2026-08-01T09:00:00.000Z';

  it('changes nothing on a first reading', () => {
    const model = deriveThreshold(
      input({
        previousReadAt: null,
        notes: [note({ id: 'n-1', sentAt: AFTER })],
        invoices: [invoice({ id: 'inv-4', due_date: '2026-08-15', updated_at: AFTER })],
        proposals: { signatureGates: [proposal({ id: 'p-1', sentAt: AFTER })], instrumentReceipts: [] },
      }),
    );
    expect(model.changed.size).toBe(0);
  });

  it('marks the note, the door, the letterbox and the room that moved', () => {
    const model = deriveThreshold(
      input({
        previousReadAt: PREVIOUS,
        notes: [note({ id: 'n-1', sentAt: AFTER })],
        invoices: [invoice({ id: 'inv-4', due_date: '2026-08-15', updated_at: AFTER })],
        proposals: {
          signatureGates: [proposal({ id: 'p-1', sentAt: null, updatedAt: AFTER })],
          instrumentReceipts: [],
        },
        selections: {
          origin: 'commercial',
          selections: [selection({ id: 's-1', roomId: 'r-lib' })],
        },
        selectionUpdatedAt: { 's-1': AFTER },
      }),
    );

    expect([...model.changed].sort()).toEqual(['door', 'letterbox', 'note', 'room-r-lib']);
  });

  it('marks a wall whose instrument moved', () => {
    const model = deriveThreshold(
      input({
        previousReadAt: PREVIOUS,
        selections: {
          origin: 'commercial',
          selections: [
            selection({
              id: 's-paint',
              kind: 'trade',
              roomId: 'r-stair',
              tradeJourney: 'substantially_complete',
              instrument: instrument('p-paint'),
            }),
          ],
        },
        selectionUpdatedAt: { 's-paint': AFTER },
      }),
    );
    expect(model.changed.has('wall')).toBe(true);
  });

  it('leaves alone what has not moved since', () => {
    const model = deriveThreshold(
      input({
        previousReadAt: PREVIOUS,
        notes: [note({ id: 'n-1', sentAt: BEFORE })],
        invoices: [invoice({ id: 'inv-4', due_date: '2026-08-15', updated_at: BEFORE })],
        proposals: {
          signatureGates: [proposal({ id: 'p-1', sentAt: BEFORE, updatedAt: BEFORE })],
          instrumentReceipts: [],
        },
      }),
    );
    expect(model.changed.size).toBe(0);
  });
});
