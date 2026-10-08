import { readFileSync } from 'fs';
import { join } from 'path';
import {
  awaitsArrivalDate,
  installReading,
  lineMaker,
  lineMakerRecord,
  makerAskSentWords,
  pieceName,
  sentThisStudioDay,
  shownMakerAsk,
  standingMakerAsk,
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

// FR4 522-2 — the band's short forms. No `N more` trailer: the short form
// exists to fit, and the sheet already carries the count.
describe('installReading — short forms (522-2)', () => {
  it('past due: {name} isn\'t here — due {day}.', () => {
    expect(read([piece('Reading chair', due('2026-10-02'))]).shortSentence).toBe(
      "Reading chair isn't here — due 2 October.",
    );
  });

  it('ahead: {name} arrives {day}. — the day only, no weekday', () => {
    const short = read([piece('Reading chair', due('2026-10-08'))]).shortSentence;
    expect(short).toBe('Reading chair arrives 8 October.');
    expect(short).not.toMatch(/day\b/);
  });

  it('undated keeps its short form', () => {
    expect(read([piece('Reading chair')]).shortSentence).toBe(
      "Reading chair isn't here — no date recorded.",
    );
  });

  it('Everything is here. is unchanged and has no short form', () => {
    const reading = read([piece('Reading chair', { status: 'delivered' })]);
    expect(reading.sentence).toBe('Everything is here.');
    expect(reading.shortSentence ?? null).toBeNull();
  });

  it.each([
    ['past', due('2026-10-02'), "Reading chair isn't here — due 2 October."],
    ['ahead', due('2026-10-08'), 'Reading chair arrives 8 October.'],
    ['undated', {}, "Reading chair isn't here — no date recorded."],
  ])('%s: the short form carries no N more trailer; the long form keeps it', (_, over, short) => {
    const reading = read([
      piece('Reading chair', over),
      piece('Brass picture light', due('2026-10-20')),
      piece('Rug', due('2026-10-21')),
    ]);
    expect(reading.shortSentence).toBe(short);
    expect(reading.shortSentence).not.toMatch(/more/);
    expect(reading.sentence).toMatch(/ 2 more aren't here\.$/);
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

  it('R36: passed first (most days first), then no date, then a date ahead', () => {
    const undated = piece('Rug');
    const ahead = piece('Lamp', due('2026-10-09'));
    const passedLess = piece('Desk', due('2026-10-05'));
    const passedMore = piece('Ladder', due('2026-10-01'));
    expect(read([undated, ahead, passedLess, passedMore]).firstItemId).toBe('ladder');
    expect(read([ahead, passedLess]).firstItemId).toBe('desk');
    // An unknown arrival is what the hire acts on; a known one waits behind it.
    const reading = read([ahead, undated]);
    expect(reading.firstItemId).toBe('rug');
    expect(reading.sentence).toBe(
      "Rug isn't here, and no arrival date is recorded. 1 more isn't here.",
    );
    expect(reading.act?.label).toBe('Ask the maker for a date');
  });

  it('R36: inside the ahead group the soonest arrival leads', () => {
    expect(
      read([piece('Lamp', due('2026-10-20')), piece('Desk', due('2026-10-09'))]).firstItemId,
    ).toBe('desk');
  });

  it("keeps the schedule's order between pieces the deadline cannot tell apart", () => {
    expect(read([piece('Reading chair'), piece('Brass picture light')]).firstItemId).toBe(
      'reading-chair',
    );
    expect(
      read([piece('Lamp', due('2026-10-02')), piece('Desk', due('2026-10-02'))]).firstItemId,
    ).toBe('lamp');
  });
});

describe('lineMaker — R42, the one maker selector', () => {
  it('reads the line vendor_name first', () => {
    expect(
      lineMaker({
        vendor_name: 'Woodward & Sons',
        purchase_order: { vendor: { name: 'Woodward and Sons Ltd' } },
        product: { brand: 'Fixture Chairworks' },
      }),
    ).toBe('Woodward & Sons');
  });

  it("else the PO's vendor, else the line's maker (its product's brand)", () => {
    expect(
      lineMaker({
        vendor_name: '  ',
        purchase_order: { vendor: { name: 'Apparatus' } },
        product: { brand: 'Fixture Pottery' },
      }),
    ).toBe('Apparatus');
    // Cedar Lane's chair: no vendor, no PO; the row prints its brand.
    expect(
      lineMaker({ vendor_name: null, purchase_order: null, product: { brand: 'Fixture Metalworks' } }),
    ).toBe('Fixture Metalworks');
  });

  it('is null only when no source is recorded', () => {
    expect(lineMaker({})).toBeNull();
    expect(
      lineMaker({ vendor_name: '', purchase_order: { vendor: null }, product: { brand: null } }),
    ).toBeNull();
  });
});

describe('lineMakerRecord — R7, the record the printed maker names', () => {
  it("the line's own name is the line's vendor; the PO's name is the PO's; a brand has none", () => {
    expect(lineMakerRecord({ vendor_name: 'Hewn', vendor_id: 'v-line' })).toEqual({
      name: 'Hewn',
      vendorId: 'v-line',
    });
    expect(
      lineMakerRecord({
        vendor_name: null,
        vendor_id: 'v-line',
        purchase_order: { vendor_id: 'v-po', vendor: { name: 'Hale' } },
      }),
    ).toEqual({ name: 'Hale', vendorId: 'v-po' });
    expect(
      lineMakerRecord({
        vendor_name: null,
        vendor_id: 'v-line',
        purchase_order: null,
        product: { brand: 'Fixture Metalworks' },
      }),
    ).toEqual({ name: 'Fixture Metalworks', vendorId: null });
  });
});

describe('standingMakerAsk — 506-3, keyed on the studio day', () => {
  // 02:00 UTC on 8 October is still 7 October in Chicago.
  const NOW = new Date('2026-10-08T02:00:00Z');
  const draft = (status: string, sentAt: string | null = null) => ({
    status,
    created_at: '2026-10-06T15:00:00Z',
    sent_at: sentAt,
  });

  it('a held or sending draft stands whatever day it was made', () => {
    expect(standingMakerAsk([draft('awaiting_review')], NOW)?.status).toBe('awaiting_review');
    expect(standingMakerAsk([draft('sending')], NOW)?.status).toBe('sending');
  });

  it('a sent draft stands for the studio day it was sent, by sent_at', () => {
    expect(standingMakerAsk([draft('sent', '2026-10-07T20:00:00Z')], NOW)).not.toBeNull();
    expect(standingMakerAsk([draft('sent', '2026-10-07T04:00:00Z')], NOW)).toBeNull();
  });

  it('a discarded draft releases the day', () => {
    expect(standingMakerAsk([draft('discarded')], NOW)).toBeNull();
  });
});

// FR4 517-4 (b) — the ask is a fact about the line until the maker answers.
describe('shownMakerAsk — 517-4, the asked-for date persists until a date is recorded', () => {
  const NOW = new Date('2026-10-08T02:00:00Z'); // 7 October in Chicago
  const sent = (sentAt: string, id = sentAt) => ({
    id,
    status: 'sent',
    created_at: sentAt,
    sent_at: sentAt,
  });

  it('a send on an earlier studio day still prints while the line waits on a date', () => {
    const ask = sent('2026-10-03T16:00:00Z');
    expect(standingMakerAsk([ask], NOW)).toBeNull(); // the route's day rule is unchanged
    expect(shownMakerAsk([ask], NOW, true)).toBe(ask);
    expect(makerAskSentWords(ask)).toBe('Asked 3 October · sent');
  });

  it('is gone once a date is recorded', () => {
    expect(shownMakerAsk([sent('2026-10-03T16:00:00Z')], NOW, false)).toBeNull();
  });

  it('names the latest send, and a held note still stands first', () => {
    const older = sent('2026-09-28T16:00:00Z');
    const latest = sent('2026-10-04T16:00:00Z');
    expect(shownMakerAsk([latest, older], NOW, true)).toBe(latest);
    expect(shownMakerAsk([older, latest], NOW, true)).toBe(latest);
    const held = { id: 'held', status: 'awaiting_review', created_at: '2026-10-05T16:00:00Z' };
    expect(shownMakerAsk([latest, held], NOW, true)).toBe(held);
  });

  it('only a send this studio day holds the act', () => {
    expect(sentThisStudioDay(sent('2026-10-07T20:00:00Z'), NOW)).toBe(true);
    expect(sentThisStudioDay(sent('2026-10-03T16:00:00Z'), NOW)).toBe(false);
  });

  it('awaitsArrivalDate: not here and no date ahead recorded', () => {
    expect(awaitsArrivalDate(piece('Chair'), TODAY)).toBe(true);
    expect(awaitsArrivalDate(piece('Chair', due('2026-10-02')), TODAY)).toBe(true);
    expect(awaitsArrivalDate(piece('Chair', due('2026-10-07')), TODAY)).toBe(false);
    expect(awaitsArrivalDate(piece('Chair', due('2026-10-20')), TODAY)).toBe(false);
    expect(awaitsArrivalDate(piece('Chair', { status: 'delivered' }), TODAY)).toBe(false);
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
