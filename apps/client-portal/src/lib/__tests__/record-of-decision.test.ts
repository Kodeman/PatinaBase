import {
  CHECKSUM_MARK_LENGTH,
  checksumMark,
  consentMethodForOutcome,
  consentSentence,
  releasedWorkSentence,
} from '../record-of-decision';

/* P-26. The words on the keepsake, tested apart from the sheet that prints
   them — the sentences are the product here, not the layout. */

describe('consentSentence', () => {
  it('writes every method the schema allows as a sentence, never as its token', () => {
    expect(consentSentence('electronic_signature')).toBe(
      'Signed electronically by typed name.',
    );
    expect(consentSentence('click_through')).toBe('Confirmed by click-through.');
    expect(consentSentence('paper')).toBe('Signed on paper.');
  });

  it('reads the review leg’s own spelling as the same sentence', () => {
    // `portal_clickthrough` belongs to `review_method`, a different column.
    // If it ever reaches this sheet it must not print itself.
    expect(consentSentence('portal_clickthrough')).toBe('Confirmed by click-through.');
  });

  it('says nothing at all rather than printing a token it cannot read', () => {
    expect(consentSentence(null)).toBeNull();
    expect(consentSentence(undefined)).toBeNull();
    expect(consentSentence('')).toBeNull();
    expect(consentSentence('some_new_method')).toBeNull();
  });

  it('never prints a raw enum value', () => {
    for (const method of ['electronic_signature', 'click_through', 'paper'] as const) {
      expect(consentSentence(method)).not.toContain('_');
    }
  });
});

describe('consentMethodForOutcome', () => {
  /**
   * Ruled 2026-09-05: only an Approve is signed. Return and Hold are a press
   * and hold, which is a click-through, and record `click_through` — never
   * NULL, and never the review leg's spelling.
   */
  it('reads the outcome as the method it was recorded under', () => {
    expect(consentMethodForOutcome('approved')).toBe('electronic_signature');
    expect(consentMethodForOutcome('changes_requested')).toBe('click_through');
    expect(consentMethodForOutcome('needs_discussion')).toBe('click_through');
  });

  it('claims no method for an approval that carries no outcome', () => {
    expect(consentMethodForOutcome(null)).toBeNull();
    expect(consentMethodForOutcome(undefined)).toBeNull();
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
