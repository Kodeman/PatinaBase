import { dayInWords, noteInBrief, owedDueLine, readingMarkLine } from '../standing';

describe('dayInWords — a calendar day as it is spoken', () => {
  it('speaks the days of the month', () => {
    expect(dayInWords(1)).toBe('first');
    expect(dayInWords(4)).toBe('fourth');
    expect(dayInWords(12)).toBe('twelfth');
    expect(dayInWords(20)).toBe('twentieth');
    expect(dayInWords(21)).toBe('twenty-first');
    expect(dayInWords(30)).toBe('thirtieth');
    expect(dayInWords(31)).toBe('thirty-first');
  });

  it('says nothing about a day no month has', () => {
    expect(dayInWords(0)).toBeNull();
    expect(dayInWords(32)).toBeNull();
    expect(dayInWords(Number.NaN)).toBeNull();
  });
});

describe('readingMarkLine — where she last stood', () => {
  it('dates the last reading in words', () => {
    expect(readingMarkLine(new Date(2026, 7, 4))).toBe('Read here on the fourth of August.');
  });

  it('says nothing on a first visit', () => {
    expect(readingMarkLine(null)).toBeNull();
    expect(readingMarkLine(undefined)).toBeNull();
  });

  it('says nothing rather than printing an unreadable date', () => {
    expect(readingMarkLine(new Date('not a date'))).toBeNull();
  });
});

describe('owedDueLine — what the owed row adds to its figure', () => {
  it('names the day one open invoice falls due', () => {
    expect(owedDueLine(new Date(2026, 7, 15), 1)).toBe('due 15 August');
  });

  it('names the FIRST day when the figure spans several DATED invoices', () => {
    expect(owedDueLine(new Date(2026, 7, 15), 3)).toBe('first due 15 August');
  });

  it('says nothing when no invoice carries a due date', () => {
    expect(owedDueLine(null, 1)).toBeNull();
  });

  it('spells the year out once the day is not in this one', () => {
    expect(owedDueLine(new Date(2026, 7, 15), 1, new Date(2027, 0, 4))).toBe(
      'due 15 August 2026',
    );
    expect(owedDueLine(new Date(2026, 7, 15), 3, new Date(2027, 0, 4))).toBe(
      'first due 15 August 2026',
    );
  });

  it('leaves the year off in the year the day falls in', () => {
    expect(owedDueLine(new Date(2026, 7, 15), 1, new Date(2026, 0, 4))).toBe('due 15 August');
  });
});

describe('noteInBrief — the note’s opening, not its body', () => {
  it('leaves a short note whole', () => {
    expect(noteInBrief('Sign and I will have them ordered by Friday.')).toBe(
      'Sign and I will have them ordered by Friday.',
    );
  });

  it('collapses the letter’s own line breaks', () => {
    expect(noteInBrief('Three last pieces\n\nfor the library.')).toBe(
      'Three last pieces for the library.',
    );
  });

  it('cuts a long note on a word and marks the cut', () => {
    const body = `${'word '.repeat(60)}end`;
    const brief = noteInBrief(body);
    expect(brief.length).toBeLessThanOrEqual(141);
    expect(brief.endsWith('…')).toBe(true);
    // the cut lands on a word: everything before the mark is the note's own
    // opening, verbatim, and never half a word or a trailing space.
    expect(body.startsWith(brief.slice(0, -1))).toBe(true);
    expect(brief.slice(0, -1)).toBe(brief.slice(0, -1).trimEnd());
  });

  it('keeps the budget it is given', () => {
    expect(noteInBrief('one two three four five', 12)).toBe('one two…');
  });

  it('does not leave a full stop standing in front of the mark', () => {
    // A cut landing just past a sentence end would otherwise read "…Friday.…"
    expect(noteInBrief('Ordered by Friday. Then the runner.', 19)).toBe('Ordered by Friday…');
    expect(noteInBrief('Is it ready? Then the runner.', 13)).toBe('Is it ready…');
  });

  it('falls to the raw cut only for text with no space in it at all', () => {
    expect(noteInBrief('a bbbbbbbbbbbbbbbbbbbb', 12)).toBe('a…');
    expect(noteInBrief('aaaaaaaaaaaaaaaaaaaaaa', 12)).toBe('aaaaaaaaaaaa…');
  });
});
