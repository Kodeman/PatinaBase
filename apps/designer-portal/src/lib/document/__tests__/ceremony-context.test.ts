/**
 * Match Ceremony context line + send-gate (R106 §2) — pure logic, no DOM.
 * Covers the cases I62 flagged: roomless (no scan), missing tags, and drifted
 * free-text budget ranges alongside the canonical slugs.
 */
import {
  assembleContextLine,
  formatBudgetBand,
  isCeremonySendable,
  type CeremonyContextLead,
  type CeremonyContextScan,
} from '../ceremony-context';

const lead = (partial: Partial<CeremonyContextLead> = {}): CeremonyContextLead => ({
  firstName: 'Elena',
  roomType: 'living_room',
  budgetRange: '15k_50k',
  ...partial,
});

const scan = (partial: Partial<CeremonyContextScan> = {}): CeremonyContextScan => ({
  roomType: 'living_room',
  ...partial,
});

describe('assembleContextLine', () => {
  it('assembles the full scanned line — arrival · style · budget', () => {
    expect(assembleContextLine(lead(), scan(), ['warm-minimal', 'japandi'])).toBe(
      'Elena scanned the living room · leans warm-minimal + japandi · $15–50k',
    );
  });

  it('uses the scan room type over the lead room type when both are present', () => {
    expect(
      assembleContextLine(lead({ roomType: 'bedroom' }), scan({ roomType: 'living_room' }), []),
    ).toBe('Elena scanned the living room · $15–50k');
  });

  // ── roomless (scan === null) ────────────────────────────────────────────
  it('roomless with a lead room type: "asked about", drawn from the lead', () => {
    expect(assembleContextLine(lead(), null, ['warm-minimal'])).toBe(
      'Elena asked about the living room · leans warm-minimal · $15–50k',
    );
  });

  it('roomless with no room type at all: falls back to "asked for help"', () => {
    expect(assembleContextLine(lead({ roomType: null }), null, [])).toBe(
      'Elena asked for help · $15–50k',
    );
  });

  it('scanned but with no room type: "shared a scan"', () => {
    expect(assembleContextLine(lead({ roomType: null }), scan({ roomType: null }), [])).toBe(
      'Elena shared a scan · $15–50k',
    );
  });

  // ── missing tags ────────────────────────────────────────────────────────
  it('drops the style segment when there are no tags', () => {
    expect(assembleContextLine(lead(), scan(), [])).toBe(
      'Elena scanned the living room · $15–50k',
    );
  });

  it('ignores blank/whitespace tags and caps at the first two', () => {
    expect(
      assembleContextLine(lead(), scan(), ['  ', 'warm-minimal', '', 'japandi', 'coastal']),
    ).toBe('Elena scanned the living room · leans warm-minimal + japandi · $15–50k');
  });

  // ── budget: slugs, drift, and absence ─────────────────────────────────────
  it('honors a drifted free-text budget verbatim (I62)', () => {
    expect(assembleContextLine(lead({ budgetRange: '$25k–$40k' }), scan(), [])).toBe(
      'Elena scanned the living room · $25k–$40k',
    );
  });

  it('drops the budget segment when the range is null', () => {
    expect(assembleContextLine(lead({ budgetRange: null }), scan(), [])).toBe(
      'Elena scanned the living room',
    );
  });

  it('falls back to a neutral subject when the first name is missing', () => {
    expect(assembleContextLine(lead({ firstName: null }), scan(), [])).toBe(
      'Your client scanned the living room · $15–50k',
    );
  });

  it('handles the fully empty payload without a trailing separator', () => {
    expect(
      assembleContextLine(lead({ firstName: null, roomType: null, budgetRange: null }), null, []),
    ).toBe('Your client asked for help');
  });
});

describe('formatBudgetBand', () => {
  it('maps each canonical slug to a friendly band', () => {
    expect(formatBudgetBand('under_5k')).toBe('under $5k');
    expect(formatBudgetBand('5k_15k')).toBe('$5–15k');
    expect(formatBudgetBand('15k_50k')).toBe('$15–50k');
    expect(formatBudgetBand('50k_100k')).toBe('$50–100k');
    expect(formatBudgetBand('over_100k')).toBe('$100k+');
  });

  it('passes drifted free text through and drops empties', () => {
    expect(formatBudgetBand('$25k–$40k')).toBe('$25k–$40k');
    expect(formatBudgetBand('  ')).toBeNull();
    expect(formatBudgetBand(null)).toBeNull();
    expect(formatBudgetBand(undefined)).toBeNull();
  });
});

describe('isCeremonySendable', () => {
  it('sleeps on an empty or whitespace-only intro', () => {
    expect(isCeremonySendable('', 2)).toBe(false);
    expect(isCeremonySendable('   \n ', 2)).toBe(false);
  });

  it('sleeps until at least two slots are offered', () => {
    expect(isCeremonySendable('Hi Elena', 0)).toBe(false);
    expect(isCeremonySendable('Hi Elena', 1)).toBe(false);
  });

  it('wakes with an intro and two or three slots', () => {
    expect(isCeremonySendable('Hi Elena', 2)).toBe(true);
    expect(isCeremonySendable('Hi Elena', 3)).toBe(true);
  });
});
