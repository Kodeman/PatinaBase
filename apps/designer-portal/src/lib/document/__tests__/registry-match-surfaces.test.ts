/**
 * `matchSurfaces` — the typed-query table over the Studio Surface Registry.
 * One surface, one row, however many lists that surface is read from.
 */
import { boardsRoutePath, matchSurfaces } from '../registry';

describe('matchSurfaces', () => {
  it('returns the call sheet once, though it stands in two lists', () => {
    // The call sheet is a STUDIO_LEDGERS entry that DOCUMENT_SCOPED_SURFACES
    // reads back out of that list rather than declaring twice; the matcher
    // spreads both, so without a key guard the row comes back doubled.
    const keys = matchSurfaces('roster').map((surface) => surface.key);

    expect(keys).toContain('call-sheet');
    expect(keys.filter((key) => key === 'call-sheet')).toHaveLength(1);
  });

  it('returns no surface twice for any query it answers', () => {
    for (const query of ['plan', 'board', 'spec', 'room', 'who', 'invoice']) {
      const keys = matchSurfaces(query).map((surface) => surface.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  // B1-L4/F62 — `boards` used to resolve to the Drafting Room (which squatted
  // on the alias) AND to `Mood boards`, under two different names. One door
  // now, under one name.
  it('finds one boards door, not three', () => {
    for (const query of ['board', 'boards', 'moodboards', 'mood board']) {
      const rows = matchSurfaces(query);
      const boards = rows.filter((surface) => surface.key === 'boards');

      expect(boards).toHaveLength(1);
      expect(boards[0].label).toBe('Boards');
      expect(rows.map((surface) => surface.key)).not.toContain('drafting-room');
      expect(rows.map((surface) => surface.label)).not.toContain('Mood boards');
    }
  });

  it('addresses the boards page the ticket, the phone and ⌘K all open', () => {
    expect(boardsRoutePath('eng-1')).toBe('/doc/eng-1/boards');
  });

  it('matches nothing on an empty query', () => {
    expect(matchSurfaces('')).toEqual([]);
    expect(matchSurfaces('   ')).toEqual([]);
  });
});
