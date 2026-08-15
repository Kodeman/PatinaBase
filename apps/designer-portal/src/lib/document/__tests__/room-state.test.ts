import { liftByRoom, roomState, roomStateWord } from '../room-state';

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
