import {
  liftByRoom,
  roomState,
  roomStateRowFromLine,
  roomStateRowFromStamp,
  roomStateWord,
} from '../room-state';

describe('the one normalization', () => {
  const line = {
    status: 'installed',
    blocked: false,
    received_quantity: null,
  };

  it('agrees whether it is handed a line or an already-derived stamp', () => {
    expect(roomStateRowFromLine(line)).toEqual({ installed: true });
    expect(roomStateRowFromStamp({ kind: 'installed' })).toEqual({
      installed: true,
    });
  });

  it('does not call an installed line with an open damage claim settled', () => {
    // The raw `status` column still reads 'installed'; the derived stamp reads
    // `damaged`. Reading the column in the spine and the stamp in the section
    // let one call the room "Installed" while the other called it "Underway".
    const damaged = { ...line, item_claims: [{ state: 'drafted' }] };
    expect(roomStateRowFromLine(damaged)).toEqual({ installed: false });
    expect(roomStateWord([roomStateRowFromLine(damaged)])).toBe('Underway');
  });

  it('does not call a blocked line settled either', () => {
    const blocked = {
      ...line,
      blocked: true,
      blocking_decision: { status: 'pending', due_date: null },
    };
    expect(roomStateRowFromLine(blocked)).toEqual({ installed: false });
  });
});

describe('roomState', () => {
  it('is future with nothing on the books', () => {
    expect(roomState([])).toBe('future');
    expect(roomStateWord([])).toBe('Not started');
  });

  it('is active while any line is short of installed', () => {
    expect(
      roomState([{ installed: true }, { installed: false }]),
    ).toBe('active');
    expect(roomStateWord([{ installed: false }])).toBe('Underway');
  });

  it('is settled only when every line is installed', () => {
    expect(roomState([{ installed: true }, { installed: true }])).toBe(
      'settled',
    );
    expect(roomStateWord([{ installed: true }])).toBe('Installed');
  });
});

describe('liftByRoom', () => {
  const rows = [
    { id: 'a', room: 'kitchen' },
    { id: 'b', room: 'living' },
    { id: 'c', room: 'kitchen' },
    { id: 'd', room: null },
  ];

  it('holds the original order when nothing is in hand', () => {
    expect(liftByRoom(rows, null, (r) => r.room).map((r) => r.id)).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
  });

  it('lifts the held room to the front and keeps both partitions in order', () => {
    expect(liftByRoom(rows, 'kitchen', (r) => r.room).map((r) => r.id)).toEqual([
      'a',
      'c',
      'b',
      'd',
    ]);
  });

  it('never drops a row — a lens is not a filter', () => {
    expect(liftByRoom(rows, 'entry', (r) => r.room)).toHaveLength(rows.length);
    expect(liftByRoom(rows, 'entry', (r) => r.room).map((r) => r.id)).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
  });

  it('does not mutate the list it was handed', () => {
    const original = [...rows];
    liftByRoom(rows, 'kitchen', (r) => r.room);
    expect(rows).toEqual(original);
  });
});
