/**
 * W4-R1 — the six status lines a quiet stop's head prints, and the sr-only
 * sentence under them. The strings themselves are the contract (the digits are
 * the seed's), so this suite states each shape once.
 */

import {
  approvalsQuietStatus,
  careQuietStatus,
  moneyQuietStatus,
  piecesQuietStatus,
  quietStateSentence,
  recordQuietStatus,
  scheduleQuietStatus,
} from '../lens-quiet-status';

const money = (cents: number) =>
  `$${Math.round(cents / 100).toLocaleString('en-US')}`;

describe('W4-R1 quiet status lines', () => {
  describe('Client approvals', () => {
    it('prints both counts, disjoint, sentence case', () => {
      expect(
        approvalsQuietStatus({ awaiting: 3, overdue: 2, overdueDays: 6 }),
      ).toBe('3 awaiting the client · 2 overdue');
    });

    it('prints the day-count only when exactly one item is overdue', () => {
      expect(
        approvalsQuietStatus({ awaiting: 2, overdue: 1, overdueDays: 6 }),
      ).toBe('2 awaiting the client · 1 overdue 6d');
      expect(
        approvalsQuietStatus({ awaiting: 2, overdue: 1, overdueDays: null }),
      ).toBe('2 awaiting the client · 1 overdue');
    });

    it('drops the absent half with its separator', () => {
      expect(
        approvalsQuietStatus({ awaiting: 0, overdue: 2, overdueDays: null }),
      ).toBe('2 overdue');
      expect(
        approvalsQuietStatus({ awaiting: 3, overdue: 0, overdueDays: null }),
      ).toBe('3 awaiting the client');
    });

    it('says Nothing yet with no fact at all', () => {
      expect(
        approvalsQuietStatus({ awaiting: 0, overdue: 0, overdueDays: null }),
      ).toBe('Nothing yet');
    });
  });

  describe('Schedule', () => {
    // W4-R1 drops the weekday the rail's own count line keeps.
    const now = new Date(2026, 7, 29);

    it('prints the install day and how far out it stands', () => {
      expect(scheduleQuietStatus({ installStart: '2026-09-19', now })).toBe(
        'Install Sep 19 · 3 weeks out',
      );
    });

    it('counts in days inside a fortnight, and names today and tomorrow', () => {
      expect(scheduleQuietStatus({ installStart: '2026-09-05', now })).toBe(
        'Install Sep 5 · 7 days out',
      );
      expect(scheduleQuietStatus({ installStart: '2026-08-29', now })).toBe(
        'Install Aug 29 · today',
      );
      expect(scheduleQuietStatus({ installStart: '2026-08-30', now })).toBe(
        'Install Aug 30 · tomorrow',
      );
    });

    it('turns to Installed once the day has passed, with no tail', () => {
      expect(scheduleQuietStatus({ installStart: '2026-08-01', now })).toBe(
        'Installed Aug 1',
      );
    });

    it('says Nothing yet with no install, Not known yet with an unreadable one', () => {
      expect(scheduleQuietStatus({ installStart: null, now })).toBe(
        'Nothing yet',
      );
      expect(scheduleQuietStatus({ installStart: 'not-a-date', now })).toBe(
        'Not known yet',
      );
    });

    it('reads a bare DATE column as LOCAL midnight, so the day never slips', () => {
      expect(scheduleQuietStatus({ installStart: '2026-09-19', now })).toContain(
        'Sep 19',
      );
    });
  });

  describe('Pieces', () => {
    it('prints lines, rooms and damage, dropping what the paper does not hold', () => {
      expect(piecesQuietStatus({ total: 62, rooms: 5, damaged: 1 })).toBe(
        '62 lines · 5 rooms · 1 damaged',
      );
      expect(piecesQuietStatus({ total: 62, rooms: 5, damaged: 0 })).toBe(
        '62 lines · 5 rooms',
      );
      expect(piecesQuietStatus({ total: 1, rooms: 1, damaged: 0 })).toBe(
        '1 line · 1 room',
      );
    });

    it('says Nothing yet on a paper with no lines', () => {
      expect(piecesQuietStatus({ total: 0, rooms: 3, damaged: 0 })).toBe(
        'Nothing yet',
      );
    });
  });

  describe('Money', () => {
    it('prints the two figures the rail prints, and no PO count', () => {
      expect(
        moneyQuietStatus({
          outCents: 1_750_000,
          notDrawnCents: 2_808_000,
          money,
        }),
      ).toBe('$17,500 out · $28,080 not drawn');
    });

    it('drops a figure it does not hold, and says Nothing yet with neither', () => {
      expect(
        moneyQuietStatus({ outCents: 175_000, notDrawnCents: 0, money }),
      ).toBe('$1,750 out');
      expect(
        moneyQuietStatus({ outCents: null, notDrawnCents: null, money }),
      ).toBe('Nothing yet');
    });
  });

  describe('Closing the book and The record', () => {
    it('prints the closure pair and the record count', () => {
      expect(careQuietStatus({ closed: 0, total: 6 })).toBe('0 of 6 closed out');
      expect(recordQuietStatus({ complete: 4 })).toBe('4 complete');
    });

    it('never becomes a dash — no checklist and no record say Nothing yet', () => {
      expect(careQuietStatus({ closed: 0, total: 0 })).toBe('Nothing yet');
      expect(recordQuietStatus({ complete: 0 })).toBe('Nothing yet');
    });
  });

  describe('the 40-character cap (OD-3, W4-C23)', () => {
    it('drops a whole segment rather than cutting inside one', () => {
      const line = piecesQuietStatus({
        total: 123_456,
        rooms: 234_567,
        damaged: 345_678,
      });
      expect(line.length).toBeLessThanOrEqual(40);
      // Whole segments only: no half word, and no trailing separator.
      expect(line).toBe('123456 lines · 234567 rooms');
      expect(line.endsWith('·')).toBe(false);
      expect(line.trimEnd()).toBe(line);
    });

    it('keeps a single over-long segment whole — a truncated fact is a wrong fact', () => {
      expect(
        piecesQuietStatus({ total: 1_234_567_890_123_456, rooms: 0, damaged: 0 }),
      ).toBe('1234567890123456 lines');
    });
  });

  describe('the sr-only sentence', () => {
    it('takes the status line FIRST segment, then the fixed form', () => {
      expect(
        quietStateSentence('3 awaiting the client · 2 overdue', 'Client approvals'),
      ).toBe(
        '3 awaiting the client · not yet on the paper · press Client approvals on the index to open',
      );
      expect(
        quietStateSentence('62 lines · 5 rooms · 1 damaged', 'Pieces'),
      ).toBe('62 lines · not yet on the paper · press Pieces on the index to open');
    });

    it('uses a one-segment line whole', () => {
      expect(quietStateSentence('0 of 6 closed out', 'Closing the book')).toBe(
        '0 of 6 closed out · not yet on the paper · press Closing the book on the index to open',
      );
    });

    it('says the phrase alone when there is no fact to press toward', () => {
      expect(quietStateSentence('Nothing yet', 'The record')).toBe('Nothing yet');
      expect(quietStateSentence('Not known yet', 'Schedule')).toBe(
        'Not known yet',
      );
    });
  });
});
