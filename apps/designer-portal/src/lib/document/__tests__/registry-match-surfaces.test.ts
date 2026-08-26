/**
 * `matchSurfaces` — the typed-query table over the Studio Surface Registry.
 * One surface, one row, however many lists that surface is read from.
 */
import { matchSurfaces } from '../registry';

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

  it('matches nothing on an empty query', () => {
    expect(matchSurfaces('')).toEqual([]);
    expect(matchSurfaces('   ')).toEqual([]);
  });
});
