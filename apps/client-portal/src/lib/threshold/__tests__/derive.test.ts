// Pinned BEFORE the imports so the whole file runs west of UTC: the seam
// between derive's parsing and standing's formatting is invisible in a UTC
// runner, and CI inherits whatever zone the runner happens to be in.
process.env.TZ = 'America/Chicago';

import type { Invoice } from '@patina/supabase';

import type { ClientSelection } from '@/lib/commercial-documents';

import {
  deriveThreshold,
  parseSourceDate,
  type ThresholdInput,
  type ThresholdNote,
  type ThresholdProposal,
  type ThresholdRoom,
} from '../derive';
import { previouslyLine } from '../standing';

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

  // A wall can only hang in a room the drawing draws. Anything else stands on
  // the Doorstep — the same fallback a door already had, and the reason no
  // ask can be counted in the standing sentence and then be findable nowhere.
  it('stands a wall on the doorstep when its room is not on the drawing', () => {
    const model = deriveThreshold(
      input({
        rooms: [ENTRY, LIBRARY],
        selections: {
          origin: 'commercial',
          selections: [{ ...wallSelection, roomId: 'r-archived' }],
        },
      }),
    );

    expect(model.marks).toHaveLength(1);
    expect(model.marks[0].roomId).toBeNull();
    expect(model.marks[0].anchor).toBe('doorstep');
    expect(model.bands.every((band) => band.marks.length === 0)).toBe(true);
    // Not drawn on the key either — the key draws only what a room holds.
    expect(model.drawnMarkCount).toBe(0);
  });

  it('stands every wall on the doorstep of a house with no rooms', () => {
    const model = deriveThreshold(
      input({
        rooms: [],
        selections: { origin: 'commercial', selections: [wallSelection] },
      }),
    );

    expect(model.groundFloor).toBe(true);
    expect(model.marks).toHaveLength(1);
    expect(model.marks[0].roomId).toBeNull();
    expect(model.marks[0].anchor).toBe('doorstep');
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

  it('opens the soonest-due open invoice; the ledger owes across all of them', () => {
    const model = deriveThreshold(input({ invoices: [later, soonest] }));

    expect(model.letterbox?.id).toBe('inv-4');
    expect(model.letterbox?.balanceCents).toBe(912_500);
    expect(model.letterbox?.dueDate).toBe('2026-08-15');
    expect(model.ledger.owedCents).toBe(1_412_500);
    expect(model.ledger.owedInvoiceCount).toBe(2);
  });

  it('owes exactly the letterbox figure when only one invoice is open', () => {
    const model = deriveThreshold(input({ invoices: [soonest] }));
    expect(model.ledger.owedCents).toBe(912_500);
    expect(model.letterbox?.balanceCents).toBe(912_500);
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

  it('takes the plan’s own planned total over the sum of the rooms’ targets', () => {
    const rooms = [
      { ...ENTRY, targetCents: 250_000 },
      { ...LIBRARY, targetCents: 689_000 },
      STAIR,
    ];
    expect(deriveThreshold(input({ rooms, plannedTotalCents: 2_380_000 })).ledger.plannedCents).toBe(
      2_380_000,
    );
    // A plan with nothing planned in it falls to the rooms, not to silence.
    expect(deriveThreshold(input({ rooms, plannedTotalCents: 0 })).ledger.plannedCents).toBe(
      939_000,
    );
  });

  it('stands at the live authorized total, and at what the bands agreed without one', () => {
    expect(deriveThreshold(input()).ledger.agreedCents).toBeNull();
    expect(
      deriveThreshold(input({ liveAuthorizedTotalCents: 1_825_000 })).ledger.agreedCents,
    ).toBe(1_825_000);

    const agreed = {
      origin: 'commercial' as const,
      selections: [
        selection({ id: 's-1', roomId: 'r-lib', clientLineTotalCents: 400_000 }),
        selection({ id: 's-2', roomId: 'r-ent', clientLineTotalCents: 120_000 }),
      ],
    };
    expect(deriveThreshold(input({ selections: agreed })).ledger.agreedCents).toBe(520_000);
    // The plan still wins where it has been read.
    expect(
      deriveThreshold(input({ selections: agreed, liveAuthorizedTotalCents: 1_825_000 })).ledger
        .agreedCents,
    ).toBe(1_825_000);
  });

  it('notes the room past its target and the one whose headroom absorbs it', () => {
    const model = deriveThreshold(
      input({
        rooms: [
          { ...ENTRY, targetCents: 100_000 },
          { ...LIBRARY, targetCents: 900_000 },
          STAIR,
        ],
        selections: {
          origin: 'commercial',
          selections: [
            selection({ id: 's-1', roomId: 'r-ent', clientLineTotalCents: 210_000 }),
            selection({ id: 's-2', roomId: 'r-lib', clientLineTotalCents: 400_000 }),
          ],
        },
      }),
    );
    expect(model.ledger.overageLine).toBe(
      'The Entry stands about eleven hundred past its target; the Library absorbs it.',
    );
    expect(deriveThreshold(input()).ledger.overageLine).toBeNull();
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
          selections: [
            selection({ id: 's-1', roomId: 'r-lib', instrument: instrument('p-1') }),
          ],
        },
        selectionUpdatedAt: { 's-1': AFTER },
      }),
    );

    // The piece is still at 'specified', so it is on the road as well as bound
    // for the library — both units tick.
    expect([...model.changed].sort()).toEqual([
      'door',
      'letterbox',
      'note',
      'road',
      'room-r-lib',
    ]);
  });

  it('lights the doorstep, not a door, when the ask that moved has no room', () => {
    const model = deriveThreshold(
      input({
        previousReadAt: PREVIOUS,
        proposals: {
          signatureGates: [proposal({ id: 'p-ds', sentAt: AFTER })],
          instrumentReceipts: [],
        },
      }),
    );
    expect([...model.changed]).toEqual(['doorstep']);
  });

  it('does not count a reading exactly on the moment as movement', () => {
    const model = deriveThreshold(
      input({ previousReadAt: PREVIOUS, notes: [note({ id: 'n-1', sentAt: PREVIOUS })] }),
    );
    expect(model.changed.size).toBe(0);
  });

  it('treats an unreadable date as no date at all', () => {
    expect(() =>
      deriveThreshold(
        input({
          previousReadAt: 'not a date',
          notes: [note({ id: 'n-1', sentAt: 'also not a date' })],
        }),
      ),
    ).not.toThrow();
    const model = deriveThreshold(
      input({ previousReadAt: PREVIOUS, notes: [note({ id: 'n-1', sentAt: 'not a date' })] }),
    );
    expect(model.changed.size).toBe(0);
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

describe('deriveThreshold — dates as the client reads them', () => {
  it('runs west of UTC, so the seam is visible', () => {
    expect(new Date().getTimezoneOffset()).toBeGreaterThan(0);
  });

  it('reads a date-only column as a calendar day, not as UTC midnight', () => {
    const model = deriveThreshold(
      input({
        notes: [
          note({ id: 'n-1', state: 'retired', body: 'Fourteen selections agreed', retiredAt: '2026-06-19' }),
        ],
      }),
    );
    expect(previouslyLine(model.previously[0] as { label: string; date: Date })).toBe(
      'Previously — Fourteen selections agreed, 19 June.',
    );
  });

  it('reads a real timestamptz on the client’s own wall clock', () => {
    // 20 June 02:00Z is still the nineteenth in Chicago.
    const model = deriveThreshold(
      input({
        proposals: {
          signatureGates: [],
          instrumentReceipts: [
            { id: 'r-1', label: 'Fourteen selections agreed', date: '2026-06-20T02:00:00.000Z' },
          ],
        },
      }),
    );
    expect(previouslyLine(model.previously[0] as { label: string; date: Date })).toBe(
      'Previously — Fourteen selections agreed, 19 June.',
    );
  });

  it('parses both shapes and rejects what it cannot read', () => {
    expect(parseSourceDate('2026-06-19')?.getDate()).toBe(19);
    expect(parseSourceDate('2026-06-19')?.getMonth()).toBe(5);
    expect(parseSourceDate('2026-06-20T02:00:00.000Z')?.getDate()).toBe(19);
    expect(parseSourceDate('not a date')).toBeNull();
    expect(parseSourceDate(null)).toBeNull();
    expect(parseSourceDate(undefined)).toBeNull();
  });

  it('sorts a date-only due date against a full timestamp without drifting a day', () => {
    const model = deriveThreshold(
      input({
        invoices: [
          invoice({ id: 'inv-late', due_date: '2026-08-16', total_cents: 100 }),
          invoice({ id: 'inv-early', due_date: '2026-08-15', total_cents: 100 }),
        ],
      }),
    );
    expect(model.letterbox?.id).toBe('inv-early');
  });
});

describe('deriveThreshold — a door with nowhere to hang', () => {
  it('falls back to the doorstep when its heaviest room is not on the drawing', () => {
    const model = deriveThreshold(
      input({
        proposals: { signatureGates: [proposal({ id: 'p-7' })], instrumentReceipts: [] },
        selections: {
          origin: 'commercial',
          selections: [
            selection({
              id: 's-1',
              roomId: 'r-archived',
              clientLineTotalCents: 400_000,
              instrument: instrument('p-7'),
            }),
          ],
        },
      }),
    );

    expect(model.marks).toHaveLength(1);
    expect(model.marks[0].roomId).toBeNull();
    expect(model.marks[0].anchor).toBe('doorstep');
    expect(model.drawnMarkCount).toBe(0);
  });

  it('still hangs on the heaviest DRAWN room when only some of it is off the drawing', () => {
    const model = deriveThreshold(
      input({
        proposals: { signatureGates: [proposal({ id: 'p-7' })], instrumentReceipts: [] },
        selections: {
          origin: 'commercial',
          selections: [
            selection({
              id: 's-gone',
              roomId: 'r-archived',
              clientLineTotalCents: 900_000,
              instrument: instrument('p-7'),
            }),
            selection({
              id: 's-here',
              roomId: 'r-ent',
              clientLineTotalCents: 120_000,
              instrument: instrument('p-7'),
            }),
          ],
        },
      }),
    );
    expect(model.marks[0].roomId).toBe('r-ent');
  });

  it('breaks a dead heat on plan order', () => {
    const model = deriveThreshold(
      input({
        proposals: { signatureGates: [proposal({ id: 'p-7' })], instrumentReceipts: [] },
        selections: {
          origin: 'commercial',
          selections: [
            selection({
              id: 's-lib',
              roomId: 'r-lib',
              clientLineTotalCents: 400_000,
              instrument: instrument('p-7'),
            }),
            selection({
              id: 's-ent',
              roomId: 'r-ent',
              clientLineTotalCents: 400_000,
              instrument: instrument('p-7'),
            }),
          ],
        },
      }),
    );
    expect(model.marks[0].roomId).toBe('r-ent');
  });
});

describe('deriveThreshold — the drawn mark count', () => {
  it('counts only the marks the key can draw', () => {
    const model = deriveThreshold(
      input({
        proposals: {
          signatureGates: [proposal({ id: 'p-room' }), proposal({ id: 'p-doorstep' })],
          instrumentReceipts: [],
        },
        selections: {
          origin: 'commercial',
          selections: [
            selection({
              id: 's-1',
              roomId: 'r-lib',
              clientLineTotalCents: 400_000,
              instrument: instrument('p-room'),
            }),
            selection({
              id: 's-paint',
              kind: 'trade',
              roomId: 'r-stair',
              tradeJourney: 'substantially_complete',
              instrument: instrument('p-paint'),
            }),
          ],
        },
      }),
    );

    expect(model.marks).toHaveLength(3);
    expect(model.drawnMarkCount).toBe(2);
  });

  it('does not count a wall in a room that is not on the drawing', () => {
    const model = deriveThreshold(
      input({
        selections: {
          origin: 'commercial',
          selections: [
            selection({
              id: 's-paint',
              kind: 'trade',
              roomId: 'r-archived',
              tradeJourney: 'substantially_complete',
              instrument: instrument('p-paint'),
            }),
          ],
        },
      }),
    );
    expect(model.marks).toHaveLength(1);
    expect(model.drawnMarkCount).toBe(0);
  });
});

describe('deriveThreshold — the doorstep asks', () => {
  it('carries the phase approvals through; they belong to no room', () => {
    const approvals = [
      { id: 'a-1', title: 'Concept direction', phaseId: 'ph-1' },
      { id: 'a-2', title: 'Millwork drawings', phaseId: 'ph-2' },
    ];
    expect(deriveThreshold(input({ approvals })).doorstepAsks).toEqual(approvals);
    expect(deriveThreshold(input()).doorstepAsks).toEqual([]);
  });
});

describe('deriveThreshold — the held draw', () => {
  const wall = (id: string, proposalId: string, roomId: string) =>
    selection({
      id,
      kind: 'trade',
      roomId,
      tradeJourney: 'substantially_complete',
      instrument: instrument(proposalId),
    });

  it('holds one figure per instrument, however many lines sit under it', () => {
    const model = deriveThreshold(
      input({
        selections: {
          origin: 'commercial',
          selections: [wall('s-a', 'p-paint', 'r-stair'), wall('s-b', 'p-paint', 'r-ent')],
        },
        heldDrawCentsByProposalId: { 'p-paint': 144_000 },
      }),
    );

    expect(model.marks).toHaveLength(2);
    expect(model.ledger.heldCents).toBe(144_000);
  });

  it('holds one figure per instrument across two instruments', () => {
    const model = deriveThreshold(
      input({
        selections: {
          origin: 'commercial',
          selections: [wall('s-a', 'p-paint', 'r-stair'), wall('s-b', 'p-tile', 'r-ent')],
        },
        heldDrawCentsByProposalId: { 'p-paint': 144_000, 'p-tile': 60_000 },
      }),
    );
    expect(model.ledger.heldCents).toBe(204_000);
  });
});

describe('deriveThreshold — what is owed across every open invoice', () => {
  const first = invoice({
    id: 'inv-4',
    due_date: '2026-08-15',
    total_cents: 1_825_000,
    amount_paid_cents: 912_500,
  });
  const second = invoice({
    id: 'inv-5',
    due_date: '2026-09-15',
    total_cents: 500_000,
    amount_paid_cents: 0,
  });

  it('sums the balances and still opens only the soonest-due one', () => {
    const model = deriveThreshold(input({ invoices: [second, first] }));

    expect(model.ledger.owedCents).toBe(1_412_500);
    expect(model.ledger.owedInvoiceCount).toBe(2);
    expect(model.letterbox?.id).toBe('inv-4');
    expect(model.letterbox?.balanceCents).toBe(912_500);
  });

  it('counts nothing when nothing is open', () => {
    const model = deriveThreshold(input());
    expect(model.ledger.owedCents).toBeNull();
    expect(model.ledger.owedInvoiceCount).toBe(0);
  });

  it('leaves an invoice with no due date at the back of the letterbox', () => {
    const undated = invoice({ id: 'inv-undated', due_date: null, total_cents: 100 });
    const model = deriveThreshold(input({ invoices: [undated, first] }));
    expect(model.letterbox?.id).toBe('inv-4');
    expect(model.ledger.owedInvoiceCount).toBe(2);
  });
});

describe('deriveThreshold — the road, the rest of it', () => {
  it('keeps a roomless piece on the road however far along it is', () => {
    const model = deriveThreshold(
      input({
        selections: {
          origin: 'commercial',
          selections: [
            selection({ id: 's-installed', roomId: null, name: 'Sconces', logisticsStatus: 'installed' }),
          ],
        },
      }),
    );
    expect(model.road.map((piece) => piece.selectionId)).toEqual(['s-installed']);
  });
});

describe('deriveThreshold — it reads, it does not rearrange', () => {
  it('leaves the caller’s arrays as it found them', () => {
    const rooms = [STAIR, ENTRY, LIBRARY];
    const notes = [note({ id: 'n-2' }), note({ id: 'n-1', state: 'retired', retiredAt: '2026-06-01' })];
    const invoices = [
      invoice({ id: 'inv-5', due_date: '2026-09-15', total_cents: 100 }),
      invoice({ id: 'inv-4', due_date: '2026-08-15', total_cents: 100 }),
    ];

    deriveThreshold(input({ rooms, notes, invoices }));

    expect(rooms.map((room) => room.id)).toEqual(['r-stair', 'r-ent', 'r-lib']);
    expect(notes.map((entry) => entry.id)).toEqual(['n-2', 'n-1']);
    expect(invoices.map((entry) => entry.id)).toEqual(['inv-5', 'inv-4']);
  });
});

describe('deriveThreshold — a room against its target', () => {
  function bandFor(targetCents: number | null | undefined, lineCents: number) {
    const model = deriveThreshold(
      input({
        rooms: [{ ...LIBRARY, targetCents }, ENTRY],
        selections: {
          origin: 'commercial',
          selections: [
            selection({ id: 's-1', roomId: 'r-lib', clientLineTotalCents: lineCents }),
          ],
        },
      }),
    );
    return model.bands.find((band) => band.roomId === 'r-lib')!;
  }

  it('carries the target and the agreed figure beside each other', () => {
    const band = bandFor(500_000, 400_000);
    expect(band.targetCents).toBe(500_000);
    expect(band.agreedCents).toBe(400_000);
    expect(band.totalCents).toBe(band.agreedCents);
  });

  it('says how far past its target a room has run', () => {
    expect(bandFor(500_000, 610_000).varianceLine).toBe(
      'about eleven hundred past its target',
    );
  });

  it('says how far under its target a room is sitting', () => {
    expect(bandFor(610_000, 500_000).varianceLine).toBe(
      'about eleven hundred under its target',
    );
  });

  it('says nothing when the room has no target, or lands on it', () => {
    expect(bandFor(null, 400_000).targetCents).toBeNull();
    expect(bandFor(null, 400_000).varianceLine).toBeNull();
    expect(bandFor(undefined, 400_000).varianceLine).toBeNull();
    expect(bandFor(400_000, 400_000).varianceLine).toBeNull();
  });

  it('treats a gap that rounds away as landing on the target', () => {
    expect(bandFor(400_000, 404_000).varianceLine).toBeNull();
  });

  it('gives an empty room its target and the whole of it as variance', () => {
    // $500 — five hundreds, so the word still helps.
    const model = deriveThreshold(input({ rooms: [{ ...LIBRARY, targetCents: 50_000 }] }));
    const band = model.bands[0];
    expect(band.agreedCents).toBe(0);
    expect(band.varianceLine).toBe('about five hundred under its target');
  });

  it('falls to figures once the hundreds stop helping', () => {
    // $5,000 is fifty hundreds — standing-sentence's own twelve-and-under rule.
    expect(bandFor(500_000, 0).varianceLine).toBe('about $5,000 under its target');
  });
});

describe('deriveThreshold — what became of each thing behind her', () => {
  it('reads a retired note she answered as answered', () => {
    const model = deriveThreshold(
      input({
        notes: [
          note({
            id: 'n-1',
            state: 'retired',
            retiredAt: '2026-07-20T00:00:00.000Z',
            answeredAt: '2026-07-19T00:00:00.000Z',
          }),
        ],
      }),
    );
    expect(model.previously[0].state).toBe('answered');
  });

  it('reads a retired note she never answered as sent', () => {
    const model = deriveThreshold(
      input({
        notes: [note({ id: 'n-1', state: 'retired', retiredAt: '2026-07-20T00:00:00.000Z' })],
      }),
    );
    expect(model.previously[0].state).toBe('sent');
  });

  it('reads a note the studio marked answered as answered', () => {
    const model = deriveThreshold(
      input({ notes: [note({ id: 'n-1', state: 'answered', retiredAt: null })] }),
    );
    expect(model.note).toBeNull();
    expect(model.previously).toEqual([]);
  });

  it('signs the instruments', () => {
    const model = deriveThreshold(
      input({
        proposals: {
          signatureGates: [],
          instrumentReceipts: [
            { id: 'r-1', label: 'Fourteen selections agreed', date: '2026-06-19' },
          ],
        },
      }),
    );
    expect(model.previously[0].state).toBe('signed');
    expect(model.previously[0].kind).toBe('instrument');
  });

  it('gives every entry a state', () => {
    const model = deriveThreshold(
      input({
        notes: [
          note({ id: 'n-a', state: 'retired', retiredAt: '2026-07-20T00:00:00.000Z' }),
          note({
            id: 'n-b',
            state: 'retired',
            retiredAt: '2026-07-21T00:00:00.000Z',
            answeredAt: '2026-07-20T00:00:00.000Z',
          }),
        ],
        proposals: {
          signatureGates: [],
          instrumentReceipts: [{ id: 'r-1', label: 'Agreed', date: '2026-06-19' }],
        },
      }),
    );
    expect(model.previously.map((entry) => entry.state)).toEqual([
      'answered',
      'sent',
      'signed',
    ]);
  });
});

describe('deriveThreshold — every unit the change tick can reach', () => {
  const PREVIOUS = '2026-08-04T12:00:00.000Z';
  const AFTER = '2026-08-05T09:00:00.000Z';
  const BEFORE = '2026-08-01T09:00:00.000Z';

  it('ticks the note when it was sent since she last read', () => {
    const model = deriveThreshold(
      input({ previousReadAt: PREVIOUS, notes: [note({ id: 'n-1', sentAt: AFTER })] }),
    );
    expect(model.changed.has('note')).toBe(true);
  });

  it('leaves the note alone when it was already there', () => {
    const model = deriveThreshold(
      input({ previousReadAt: PREVIOUS, notes: [note({ id: 'n-1', sentAt: BEFORE })] }),
    );
    expect(model.changed.has('note')).toBe(false);
  });

  it('shows no ticks at all on a first visit, note and all', () => {
    const model = deriveThreshold(
      input({
        previousReadAt: null,
        notes: [note({ id: 'n-1', sentAt: AFTER })],
        selections: {
          origin: 'commercial',
          selections: [
            selection({ id: 's-1', roomId: null, logisticsStatus: 'shipped' }),
          ],
        },
        selectionUpdatedAt: { 's-1': AFTER },
        proposals: {
          signatureGates: [],
          instrumentReceipts: [{ id: 'r-1', label: 'Agreed', date: AFTER }],
        },
      }),
    );
    expect(model.note).not.toBeNull();
    expect(model.road).toHaveLength(1);
    expect(model.previously).toHaveLength(1);
    expect(model.changed.size).toBe(0);
  });

  it('ticks the road when a piece on it moved', () => {
    const model = deriveThreshold(
      input({
        previousReadAt: PREVIOUS,
        selections: {
          origin: 'commercial',
          selections: [
            selection({ id: 's-roadside', roomId: null, name: 'Sconces', logisticsStatus: 'shipped' }),
          ],
        },
        selectionUpdatedAt: { 's-roadside': AFTER },
      }),
    );
    expect(model.road.map((piece) => piece.selectionId)).toEqual(['s-roadside']);
    expect(model.changed.has('road')).toBe(true);
  });

  it('leaves the road alone when nothing on it moved', () => {
    const model = deriveThreshold(
      input({
        previousReadAt: PREVIOUS,
        selections: {
          origin: 'commercial',
          selections: [
            selection({ id: 's-roadside', roomId: null, logisticsStatus: 'shipped' }),
          ],
        },
        selectionUpdatedAt: { 's-roadside': BEFORE },
      }),
    );
    expect(model.changed.has('road')).toBe(false);
  });

  it('ticks both the road and the room a bound piece is headed for', () => {
    const model = deriveThreshold(
      input({
        previousReadAt: PREVIOUS,
        selections: {
          origin: 'commercial',
          selections: [
            selection({ id: 's-1', roomId: 'r-lib', logisticsStatus: 'shipped' }),
          ],
        },
        selectionUpdatedAt: { 's-1': AFTER },
      }),
    );
    expect(model.changed.has('road')).toBe(true);
    expect(model.changed.has('room-r-lib')).toBe(true);
  });

  it('ticks a band by its own anchor when one of its pieces moved', () => {
    const model = deriveThreshold(
      input({
        previousReadAt: PREVIOUS,
        selections: {
          origin: 'commercial',
          selections: [
            selection({ id: 's-1', roomId: 'r-lib', logisticsStatus: 'installed' }),
            selection({ id: 's-2', roomId: 'r-ent', logisticsStatus: 'installed' }),
          ],
        },
        selectionUpdatedAt: { 's-1': AFTER, 's-2': BEFORE },
      }),
    );

    const library = model.bands.find((band) => band.roomId === 'r-lib')!;
    const entry = model.bands.find((band) => band.roomId === 'r-ent')!;
    expect(model.changed.has(library.anchor)).toBe(true);
    expect(model.changed.has(entry.anchor)).toBe(false);
    // Installed pieces are home, so neither one is on the road.
    expect(model.changed.has('road')).toBe(false);
  });

  it('ticks previously when something landed behind her since', () => {
    const model = deriveThreshold(
      input({
        previousReadAt: PREVIOUS,
        proposals: {
          signatureGates: [],
          instrumentReceipts: [{ id: 'r-1', label: 'Fourteen selections agreed', date: AFTER }],
        },
      }),
    );
    expect(model.changed.has('previously')).toBe(true);
  });

  it('ticks previously for a note taken down since', () => {
    const model = deriveThreshold(
      input({
        previousReadAt: PREVIOUS,
        notes: [note({ id: 'n-1', state: 'retired', retiredAt: AFTER })],
      }),
    );
    expect(model.changed.has('previously')).toBe(true);
  });

  it('leaves previously alone when its newest entry is older than her reading', () => {
    const model = deriveThreshold(
      input({
        previousReadAt: PREVIOUS,
        notes: [note({ id: 'n-1', state: 'retired', retiredAt: BEFORE })],
        proposals: {
          signatureGates: [],
          instrumentReceipts: [{ id: 'r-1', label: 'Agreed', date: BEFORE }],
        },
      }),
    );
    expect(model.changed.has('previously')).toBe(false);
  });

  it('leaves previously alone when an entry carries no date at all', () => {
    const model = deriveThreshold(
      input({
        previousReadAt: PREVIOUS,
        proposals: {
          signatureGates: [],
          instrumentReceipts: [{ id: 'r-1', label: 'Agreed', date: null }],
        },
      }),
    );
    expect(model.previously).toHaveLength(1);
    expect(model.changed.has('previously')).toBe(false);
  });
});
