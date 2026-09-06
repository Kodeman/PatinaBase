import {
  CHECKSUM_MARK_LENGTH,
  checksumMark,
  recordStampStateForApproval,
  releasedWorkSentence,
  signatureBlock,
  supersededNoteSentence,
} from '../record-of-decision';

/* P-26. The words on the keepsake, tested apart from the sheet that prints
   them — the sentences are the product here, not the layout. */

/* `W3W-R2-01` / `W3W-R1-05`. The block follows the ROW: the stored consent
   method decides the heading and the sentence, the stored name decides
   whether a name is printed, and a row that records neither says "Recorded"
   and states the day. Four cases, because the column has four values and the
   fourth is the one every approval in production carries. */
describe('signatureBlock', () => {
  const DAY = '5 September 2026';
  const LINE = 'Answered 5 September 2026';

  it('names her where she typed her name', () => {
    expect(
      signatureBlock({
        method: 'electronic_signature',
        name: 'Margaret Whitfield',
        day: DAY,
        dateLine: LINE,
      }),
    ).toEqual({
      heading: 'Signed',
      name: 'Margaret Whitfield',
      dateLine: LINE,
      sentence: 'Signed electronically by typed name: Margaret Whitfield.',
    });
  });

  it('claims the method but never the name, where the row carries no name', () => {
    const block = signatureBlock({
      method: 'electronic_signature',
      name: '   ',
      day: DAY,
      dateLine: LINE,
    });
    expect(block.heading).toBe('Signed');
    expect(block.name).toBeNull();
    expect(block.sentence).toBe('Signed electronically.');
  });

  it('heads a press-and-hold "Confirmed", and prints no signature', () => {
    for (const method of ['click_through', 'portal_clickthrough'] as const) {
      expect(signatureBlock({ method, name: 'Margaret Whitfield', day: DAY, dateLine: LINE }))
        .toEqual({
          heading: 'Confirmed',
          name: null,
          dateLine: LINE,
          sentence: 'Confirmed by press-and-hold.',
        });
    }
  });

  it('says where a wet signature was given', () => {
    expect(
      signatureBlock({ method: 'paper', name: 'Harper Vale', day: DAY, dateLine: 'Signed 5 September 2026' }),
    ).toEqual({
      heading: 'Signed',
      name: 'Harper Vale',
      dateLine: 'Signed 5 September 2026',
      sentence: 'Signed on paper.',
    });
  });

  it('records, and claims nothing, where the row carries no method', () => {
    for (const method of [null, undefined, '', 'biometric']) {
      const block = signatureBlock({ method, name: 'Margaret Whitfield', day: DAY, dateLine: LINE });
      expect(block).toEqual({
        heading: 'Recorded',
        name: null,
        dateLine: null,
        sentence: 'Recorded on 5 September 2026.',
      });
      expect(block.sentence).not.toMatch(/sign/i);
    }
  });

  it('states no day it does not have', () => {
    expect(signatureBlock({ method: null, day: null }).sentence).toBeNull();
  });

  it('never prints a raw enum value', () => {
    for (const method of ['electronic_signature', 'click_through', 'paper'] as const) {
      expect(signatureBlock({ method, name: 'Harper Vale' }).sentence).not.toContain('_');
    }
  });
});

describe('checksumMark', () => {
  it('keeps twelve characters of the hash and no more (R6)', () => {
    const mark = checksumMark('A'.repeat(64));
    expect(mark).toBe('a'.repeat(CHECKSUM_MARK_LENGTH));
    expect(mark).toHaveLength(12);
  });

  it('does not pad a hash too short to trim into looking like one', () => {
    expect(checksumMark('abc123')).toBe('abc123');
  });

  it('presses no mark at all when there is no hash', () => {
    expect(checksumMark(null)).toBeNull();
    expect(checksumMark('   ')).toBeNull();
  });
});

describe('releasedWorkSentence', () => {
  it('names the one piece it let go', () => {
    expect(releasedWorkSentence(['Walnut credenza'])).toBe('It releases Walnut credenza.');
  });

  it('counts rather than names a catalogue name carrying a comma', () => {
    // "Built-in shelving, north wall" joined with "and" reads as three things.
    expect(releasedWorkSentence(['Built-in shelving, north wall'])).toBe(
      'It releases one piece that was waiting on it.',
    );
  });

  it('counts several in words, in one register', () => {
    expect(releasedWorkSentence(['a', 'b', 'c'])).toBe(
      'It releases three pieces that were waiting on it.',
    );
    expect(releasedWorkSentence(Array.from({ length: 14 }, () => 'x'))).toBe(
      'It releases fourteen pieces that were waiting on it.',
    );
  });

  it('claims nothing about work it cannot see', () => {
    expect(releasedWorkSentence([])).toBeNull();
    expect(releasedWorkSentence(null)).toBeNull();
    expect(releasedWorkSentence(['   '])).toBeNull();
  });
});

describe('recordStampStateForApproval', () => {
  it('presses her outcome, even after the studio issued a later edition', () => {
    expect(
      recordStampStateForApproval({ disposition: 'superseded', outcome: 'approved' }),
    ).toBe('approved');
    expect(
      recordStampStateForApproval({
        disposition: 'superseded',
        outcome: 'changes_requested',
      }),
    ).toBe('returned');
    expect(
      recordStampStateForApproval({
        disposition: 'superseded',
        outcome: 'needs_discussion',
      }),
    ).toBe('held');
  });

  it('presses the plain outcome on a live record', () => {
    expect(
      recordStampStateForApproval({ disposition: 'active', outcome: 'approved' }),
    ).toBe('approved');
  });

  it('falls to the disposition only when there is no answer to print', () => {
    expect(
      recordStampStateForApproval({ disposition: 'withdrawn', outcome: null }),
    ).toBe('withdrawn');
    expect(
      recordStampStateForApproval({ disposition: 'superseded', outcome: null }),
    ).toBe('superseded');
    expect(recordStampStateForApproval({ disposition: 'active', outcome: null })).toBe(
      'awaiting',
    );
  });
});

describe('supersededNoteSentence', () => {
  it('states the later edition and dates it', () => {
    expect(supersededNoteSentence('14 August 2026')).toBe(
      'A later edition replaced this one on 14 August 2026.',
    );
  });

  it('says it without a day rather than inventing one', () => {
    expect(supersededNoteSentence(null)).toBe(
      'A later edition has since replaced this one.',
    );
    expect(supersededNoteSentence('   ')).toBe(
      'A later edition has since replaced this one.',
    );
  });

  it('never says her answer was undone or reopened (P-27)', () => {
    for (const sentence of [
      supersededNoteSentence('14 August 2026'),
      supersededNoteSentence(null),
    ]) {
      expect(sentence).not.toMatch(/undone|reopen|invalid|no longer|cancell?ed|void/i);
    }
  });
});
