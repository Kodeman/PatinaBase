/**
 * The marker the seal leaves behind. It is written on one page and read on
 * another, so its whole contract is timing: written only where the flag put it
 * there, read exactly once, and never surviving into a second arrival.
 *
 * The page's own guard (`if (worktableOn) markSealTurn(...)`) is asserted here
 * as the flag-off case, since nothing else in the suite covers it.
 */
import { markSealTurn, readAndClearSealTurn } from '../seal-turn';

const KEY = 'patina:doc-seal-turn';

/** The page's redirect effect, reduced to the one line under test. */
function redirectTo(projectId: string, worktableOn: boolean) {
  if (worktableOn) markSealTurn(projectId);
}

describe('the seal marker', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('is written by the redirect when the flag is on', () => {
    redirectTo('project-1', true);

    expect(window.sessionStorage.getItem(KEY)).toBe('project-1');
  });

  it('is not written when the flag is off', () => {
    redirectTo('project-1', false);

    expect(window.sessionStorage.getItem(KEY)).toBeNull();
  });

  it('writes nothing for an empty project id', () => {
    markSealTurn('');

    expect(window.sessionStorage.getItem(KEY)).toBeNull();
  });
});

describe('reading the seal marker', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('answers the arrival it was left for', () => {
    markSealTurn('project-1');

    expect(readAndClearSealTurn('project-1')).toBe(true);
  });

  it('answers once — a reload is a new arrival, not a repeat announcement', () => {
    markSealTurn('project-1');

    expect(readAndClearSealTurn('project-1')).toBe(true);
    expect(readAndClearSealTurn('project-1')).toBe(false);
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
  });

  it('answers false when no seal was marked', () => {
    expect(readAndClearSealTurn('project-1')).toBe(false);
  });

  it('sweeps a marker left for another document, and never prints it here', () => {
    // Deliberate: the marker is cleared on the FIRST read whoever reads it, so
    // a redirect the designer abandoned (they navigated somewhere else instead)
    // cannot lie in wait and announce a seal on an unrelated document later.
    // The cost is the announcement itself, which is one quiet line.
    markSealTurn('project-1');

    expect(readAndClearSealTurn('project-2')).toBe(false);
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
  });

  it('reads nothing for an empty project id, and leaves the marker alone', () => {
    markSealTurn('project-1');

    expect(readAndClearSealTurn('')).toBe(false);
    expect(window.sessionStorage.getItem(KEY)).toBe('project-1');
  });

  it('survives a store that refuses to answer', () => {
    const getItem = jest
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('blocked');
      });
    const setItem = jest
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('blocked');
      });

    expect(() => markSealTurn('project-1')).not.toThrow();
    expect(readAndClearSealTurn('project-1')).toBe(false);

    getItem.mockRestore();
    setItem.mockRestore();
  });
});
