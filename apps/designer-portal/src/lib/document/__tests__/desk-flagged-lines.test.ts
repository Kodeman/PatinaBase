/**
 * Desk flagged-lines fold (Schedule & Boards Wave 2 · C4) — pure logic, no DOM.
 * Mirrors the desk-conflicts test: synthetic flattened rows → per-proposal map.
 */
import { buildDeskFlaggedLines, type FlaggedLineRow } from '../desk-flagged-lines';

const row = (partial: Partial<FlaggedLineRow>): FlaggedLineRow => ({
  proposalId: 'pr1',
  proposalTitle: 'Whitfield Residence',
  ...partial,
});

describe('buildDeskFlaggedLines', () => {
  it('returns an empty map for no rows', () => {
    expect(buildDeskFlaggedLines([]).size).toBe(0);
  });

  it('folds a single flagged line into a one-count entry', () => {
    const map = buildDeskFlaggedLines([row({})]);
    expect(map.get('pr1')).toEqual({
      count: 1,
      docTitle: 'Whitfield Residence',
      proposalId: 'pr1',
    });
  });

  it('counts every unresolved rejection on the same proposal', () => {
    const map = buildDeskFlaggedLines([row({}), row({}), row({})]);
    expect(map.get('pr1')?.count).toBe(3);
    expect(map.size).toBe(1);
  });

  it('keys separate proposals independently', () => {
    const map = buildDeskFlaggedLines([
      row({ proposalId: 'pr1' }),
      row({ proposalId: 'pr2', proposalTitle: 'Olsen Penthouse' }),
      row({ proposalId: 'pr2', proposalTitle: 'Olsen Penthouse' }),
    ]);
    expect(map.size).toBe(2);
    expect(map.get('pr1')?.count).toBe(1);
    expect(map.get('pr2')).toEqual({
      count: 2,
      docTitle: 'Olsen Penthouse',
      proposalId: 'pr2',
    });
  });

  it('falls back to "the proposal" when a row carries no title', () => {
    const map = buildDeskFlaggedLines([row({ proposalTitle: null })]);
    expect(map.get('pr1')?.docTitle).toBe('the proposal');
  });

  it('backfills a real title from a later row when the first had none', () => {
    const map = buildDeskFlaggedLines([
      row({ proposalTitle: null }),
      row({ proposalTitle: 'Whitfield Residence' }),
    ]);
    expect(map.get('pr1')).toEqual({
      count: 2,
      docTitle: 'Whitfield Residence',
      proposalId: 'pr1',
    });
  });

  it('skips rows with no proposal id', () => {
    const map = buildDeskFlaggedLines([row({ proposalId: '' }), row({ proposalId: 'pr1' })]);
    expect(map.size).toBe(1);
    expect(map.get('pr1')?.count).toBe(1);
  });

  it('folds board-pin flags into the SAME proposal folder as line flags (B4)', () => {
    // use-desk-engagements concats line rows + board-pin rows into one array;
    // both resolve to {proposalId, proposalTitle}, so a board flag and a line
    // flag on one proposal sum into a single lines_flagged folder.
    const lineFlags = [row({}), row({})]; // 2 schedule-line flags on pr1
    const boardFlags = [row({}), row({})]; // 2 board-pin flags on pr1
    const map = buildDeskFlaggedLines([...lineFlags, ...boardFlags]);
    expect(map.size).toBe(1);
    expect(map.get('pr1')?.count).toBe(4);
  });
});
