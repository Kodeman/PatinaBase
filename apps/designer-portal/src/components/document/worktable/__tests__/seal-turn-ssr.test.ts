/**
 * @jest-environment node
 *
 * The marker module is imported by a client component that Next also renders on
 * the server, where there is no `window` at all. Both entry points must be inert
 * rather than throwing — jsdom cannot prove that, so this one file runs without
 * a DOM.
 */
import { markSealTurn, readAndClearSealTurn } from '../seal-turn';

describe('the seal marker without a window', () => {
  it('writes nothing and throws nothing', () => {
    expect(typeof window).toBe('undefined');
    expect(() => markSealTurn('project-1')).not.toThrow();
  });

  it('reads false and throws nothing', () => {
    expect(readAndClearSealTurn('project-1')).toBe(false);
  });
});
