/**
 * Ruling IV — overdue is one derivation with three renderings.
 *
 * These assertions pin both halves of the ruling: the derivation itself, and
 * the fact that each of the three renderings is a pure read of the SAME
 * condition value rather than its own second computation.
 */

import {
  deriveOverdue,
  overdueElapsedPhrase,
  overdueSortTier,
  overdueStampLabel,
  NOT_OVERDUE,
} from '../overdue-condition';

const NOW = new Date('2026-05-12T09:00:00.000Z');

describe('deriveOverdue', () => {
  it('reports nothing without a due moment', () => {
    expect(deriveOverdue(null, NOW)).toEqual(NOT_OVERDUE);
    expect(deriveOverdue(undefined, NOW)).toEqual(NOT_OVERDUE);
    expect(deriveOverdue('not-a-date', NOW)).toEqual(NOT_OVERDUE);
  });

  it('holds only once the due moment has passed', () => {
    expect(deriveOverdue('2026-05-20T09:00:00.000Z', NOW).isOverdue).toBe(
      false,
    );
    expect(deriveOverdue('2026-05-12T09:00:00.000Z', NOW).isOverdue).toBe(
      false,
    );
    expect(deriveOverdue('2026-05-06T09:00:00.000Z', NOW)).toEqual({
      isOverdue: true,
      days: 6,
    });
  });

  it('counts a just-passed due moment as one day rather than zero', () => {
    expect(deriveOverdue('2026-05-12T08:00:00.000Z', NOW)).toEqual({
      isOverdue: true,
      days: 1,
    });
  });

  it('parses a bare DATE as local midnight so the count cannot slip a day', () => {
    const local = new Date('2026-05-08T12:00:00');
    expect(deriveOverdue('2026-05-06', local)).toEqual({
      isOverdue: true,
      days: 2,
    });
  });

  it('lets the projection withhold the condition but never assert it early', () => {
    // The server said "not overdue" — the client clock does not overrule it.
    expect(deriveOverdue('2026-05-06T09:00:00.000Z', NOW, false)).toEqual(
      NOT_OVERDUE,
    );
    // The server said "overdue" on a date that has not arrived — still nothing.
    expect(deriveOverdue('2026-05-20T09:00:00.000Z', NOW, true).isOverdue).toBe(
      false,
    );
  });
});

describe('the three renderings read one condition', () => {
  const condition = deriveOverdue('2026-05-06T09:00:00.000Z', NOW);

  it('1 · the margin item takes a terracotta stamp', () => {
    expect(overdueStampLabel(condition)).toBe('Overdue · 6 days');
    expect(overdueStampLabel(NOT_OVERDUE)).toBeNull();
  });

  it('2 · the guide sentence changes tense to the elapsed phrase', () => {
    expect(overdueElapsedPhrase(condition)).toBe('6 days');
    expect(overdueElapsedPhrase(NOT_OVERDUE)).toBeNull();
  });

  it('3 · the Desk folio sorts upward', () => {
    expect(overdueSortTier(condition)).toBe(0);
    expect(overdueSortTier(NOT_OVERDUE)).toBe(1);
  });

  it('renders one day without a plural', () => {
    const oneDay = deriveOverdue('2026-05-11T09:00:00.000Z', NOW);
    expect(overdueStampLabel(oneDay)).toBe('Overdue · 1 day');
    expect(overdueElapsedPhrase(oneDay)).toBe('1 day');
  });

  it('never offers a badge count, a banner, or an auto-action', () => {
    // The module's whole surface: a derivation and three pure renderings.
    // Anything that could nag lives nowhere in it.
    const surface = Object.keys(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('../overdue-condition') as Record<string, unknown>,
    ).sort();
    expect(surface).toEqual([
      'NOT_OVERDUE',
      'deriveOverdue',
      'overdueElapsedPhrase',
      'overdueSortTier',
      'overdueStampLabel',
    ]);
  });
});
