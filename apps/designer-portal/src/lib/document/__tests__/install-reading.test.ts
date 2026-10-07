import { readFileSync } from 'fs';
import { join } from 'path';
import {
  installReading,
  pieceName,
  type InstallReading,
  type InstallReadingPiece,
} from '../install-reading';

// Wednesday 7 October 2026, mid-afternoon: the reading reads the day, not the hour.
const TODAY = new Date(2026, 9, 7, 15, 30);

const piece = (
  name: string,
  over: Partial<InstallReadingPiece> = {},
): InstallReadingPiece => ({
  id: name.toLowerCase().replace(/[^a-z]+/g, '-'),
  name,
  status: 'ordered',
  purchase_order: null,
  ...over,
});

const due = (confirmed_eta: string) => ({
  purchase_order: { confirmed_eta, delivered_date: null },
});

const read = (
  pieces: InstallReadingPiece[],
  windowHeld = false,
): InstallReading => {
  const reading = installReading(pieces, TODAY, windowHeld);
  if (!reading) throw new Error('expected a reading');
  return reading;
};

describe('installReading — D6 copy by state', () => {
  it('a piece not here with no arrival date asks the maker', () => {
    const reading = read([piece('Reading chair')]);
    expect(reading.sentence).toBe(
      "Reading chair isn't here, and no arrival date is recorded.",
    );
    expect(reading.state).toBe('not_here_undated');
    expect(reading.act?.label).toBe('Ask the maker for a date');
    expect(reading.firstItemId).toBe('reading-chair');
  });

  it('a piece not here whose arrival date passed asks the maker', () => {
    const reading = read([piece('Reading chair', due('2026-10-02'))]);
    expect(reading.sentence).toBe('Reading chair was due 2 October and isn\'t here.');
    expect(reading.state).toBe('not_here_past');
    expect(reading.act?.label).toBe('Ask the maker for a date');
  });

  it('a piece arriving offers to hold a window while none is held', () => {
    const reading = read([piece('Reading chair', due('2026-10-08'))]);
    expect(reading.sentence).toBe('Reading chair arrives Thursday 8 October.');
    expect(reading.state).toBe('not_here_ahead');
    expect(reading.act?.label).toBe('Hold a window');
  });

  it('a piece arriving with a window already held has no act', () => {
    const reading = read([piece('Reading chair', due('2026-10-08'))], true);
    expect(reading.sentence).toBe('Reading chair arrives Thursday 8 October.');
    expect(reading.act).toBeNull();
  });

  it('everything here opens the punch list', () => {
    const reading = read([
      piece('Reading chair', { status: 'delivered' }),
      piece('Sofa', { status: 'installed' }),
      piece('Lamp', { purchase_order: { delivered_date: '2026-10-01' } }),
    ]);
    expect(reading.sentence).toBe('Everything is here.');
    expect(reading.state).toBe('all_here');
    expect(reading.act?.label).toBe('Open the punch list');
    expect(reading.firstItemId).toBeNull();
  });

  it('a date due today has not passed: the piece arrives today', () => {
    expect(read([piece('Reading chair', due('2026-10-07'))]).sentence).toBe(
      'Reading chair arrives Wednesday 7 October.',
    );
  });

  it('a date in another year carries its year', () => {
    expect(read([piece('Reading chair', due('2025-12-29'))]).sentence).toBe(
      "Reading chair was due 29 December 2025 and isn't here.",
    );
  });

  it('prints nothing for a job with no pieces', () => {
    expect(installReading([], TODAY, false)).toBeNull();
  });
});

describe('installReading — several pieces not here', () => {
  it('names the first and counts one more', () => {
    expect(
      read([piece('Reading chair'), piece('Brass picture light')]).sentence,
    ).toBe("Reading chair isn't here, and no arrival date is recorded. 1 more isn't here.");
  });

  it('names the first and counts N more', () => {
    expect(
      read([piece('Reading chair'), piece('Brass picture light'), piece('Rug')]).sentence,
    ).toBe("Reading chair isn't here, and no arrival date is recorded. 2 more aren't here.");
  });

  it('counts only the pieces that are not here', () => {
    expect(
      read([
        piece('Reading chair'),
        piece('Shelving', { status: 'delivered' }),
        piece('Brass picture light'),
      ]).sentence,
    ).toBe("Reading chair isn't here, and no arrival date is recorded. 1 more isn't here.");
  });

  it('orders by the Next deadline order: passed first (most days), then ahead, then undated', () => {
    const undated = piece('Rug');
    const ahead = piece('Lamp', due('2026-10-09'));
    const passedLess = piece('Desk', due('2026-10-05'));
    const passedMore = piece('Ladder', due('2026-10-01'));
    expect(read([undated, ahead, passedLess, passedMore]).firstItemId).toBe('ladder');
    expect(read([undated, ahead]).firstItemId).toBe('lamp');
  });

  it("keeps the schedule's order between pieces the deadline cannot tell apart", () => {
    expect(read([piece('Reading chair'), piece('Brass picture light')]).firstItemId).toBe(
      'reading-chair',
    );
  });
});

describe('installReading — Cedar Lane (acceptance 1-4)', () => {
  it('reads the walk fixture as the rulings print it', () => {
    const reading = read([
      piece('Reading chair, oiled oak and shearling', { status: 'production' }),
      piece('Walnut shelving', { status: 'delivered' }),
      piece('Brass picture light, 24 in', { status: 'ordered' }),
    ]);
    expect(reading.sentence).toBe(
      "Reading chair isn't here, and no arrival date is recorded. 1 more isn't here.",
    );
  });

  it('speaks a line by its piece, without the spec after the comma', () => {
    expect(pieceName('Reading chair, oiled oak and shearling')).toBe('Reading chair');
    expect(pieceName('Teak porch bench')).toBe('Teak porch bench');
  });
});

describe('installReading — prints the fact, never a judgement or a ratio', () => {
  const everyReading = (): InstallReading[] => [
    read([piece('Reading chair')]),
    read([piece('Reading chair', due('2026-09-01'))]),
    read([piece('Reading chair', due('2026-10-20'))]),
    read([piece('Reading chair', due('2026-10-20'))], true),
    read([piece('Reading chair', { status: 'installed' })]),
    read([piece('Reading chair'), piece('Lamp'), piece('Rug'), piece('Desk')]),
  ];

  it.each(['late', 'behind', 'of'])('no sentence or act contains "%s"', (word) => {
    for (const reading of everyReading()) {
      const printed = `${reading.sentence} ${reading.act?.label ?? ''}`;
      expect(printed).not.toMatch(new RegExp(`\\b${word}\\b`, 'i'));
    }
  });

  it('never prints a ratio', () => {
    for (const reading of everyReading()) {
      expect(reading.sentence).not.toMatch(/\d+\s*(of|\/)\s*\d+/i);
    }
  });

  it('never reads the install start: a phase start on the piece changes nothing', () => {
    const withStart = {
      ...piece('Reading chair'),
      install_start: '2026-06-11',
      starts_on: '2026-06-11',
      ack_ship_date: '2026-10-01',
    } as InstallReadingPiece;
    expect(read([withStart]).sentence).toBe(
      "Reading chair isn't here, and no arrival date is recorded.",
    );
    // Its only inputs are the pieces, today and whether a window is held.
    expect(installReading.length).toBe(3);
    const source = readFileSync(join(__dirname, '..', 'install-reading.ts'), 'utf8');
    for (const forbidden of [
      'project_phases',
      'useProjectPhases',
      'installEntryPhaseId',
      'starts_on',
      'ack_ship_date',
      'po_acknowledgments',
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
