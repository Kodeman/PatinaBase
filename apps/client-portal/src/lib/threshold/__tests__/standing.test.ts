import {
  houseOverageLine,
  keySentence,
  previouslyLine,
  thresholdStanding,
} from '../standing';

describe('thresholdStanding — what is asked of the client', () => {
  it('names one closed door', () => {
    expect(
      thresholdStanding({ doors: 1, walls: 0, balanceCents: 0, nothingOwed: false }),
    ).toBe('One door in this house is closed until you sign it.');
  });

  it('names finished work with no door', () => {
    expect(
      thresholdStanding({ doors: 0, walls: 1, balanceCents: 0, nothingOwed: false }),
    ).toBe('Finished work waits for your acceptance.');
  });

  it('joins a door and a wall', () => {
    expect(
      thresholdStanding({ doors: 1, walls: 1, balanceCents: 0, nothingOwed: false }),
    ).toBe(
      'One door in this house is closed until you sign it, and finished work waits for your acceptance.',
    );
  });

  it('counts several doors in words', () => {
    expect(
      thresholdStanding({ doors: 3, walls: 0, balanceCents: 0, nothingOwed: false }),
    ).toBe('Three doors in this house are closed until you sign them.');
  });

  it('counts several doors alongside the wall clause', () => {
    expect(
      thresholdStanding({ doors: 2, walls: 1, balanceCents: 0, nothingOwed: false }),
    ).toBe(
      'Two doors in this house are closed until you sign them, and finished work waits for your acceptance.',
    );
  });

  it('falls to figures past twelve', () => {
    expect(
      thresholdStanding({ doors: 13, walls: 0, balanceCents: 0, nothingOwed: false }),
    ).toBe('13 doors in this house are closed until you sign them.');
  });
});

describe('thresholdStanding — when nothing waits', () => {
  it('says so plainly', () => {
    expect(
      thresholdStanding({ doors: 0, walls: 0, balanceCents: 0, nothingOwed: true }),
    ).toBe('Nothing waits for your name.');
  });

  it('adds the balance when one stands open', () => {
    expect(
      thresholdStanding({ doors: 0, walls: 0, balanceCents: 912_500, nothingOwed: true }),
    ).toBe('Nothing waits for your name. A balance of $9,125 stands open.');
  });

  it('adds the credenza line last', () => {
    expect(
      thresholdStanding({
        doors: 0,
        walls: 0,
        balanceCents: 912_500,
        nothingOwed: true,
        credenzaLine: 'Your walnut credenza is on the bench in Dayton.',
      }),
    ).toBe(
      'Nothing waits for your name. A balance of $9,125 stands open. Your walnut credenza is on the bench in Dayton.',
    );
  });

  it('adds the credenza line with no balance to report', () => {
    expect(
      thresholdStanding({
        doors: 0,
        walls: 0,
        balanceCents: 0,
        nothingOwed: true,
        credenzaLine: 'Your walnut credenza is on the bench in Dayton.',
      }),
    ).toBe('Nothing waits for your name. Your walnut credenza is on the bench in Dayton.');
  });

  it('never reports a zero balance', () => {
    expect(
      thresholdStanding({ doors: 0, walls: 0, balanceCents: 0, nothingOwed: true }),
    ).not.toContain('$0');
  });

  it('says nothing waits when no mark stands, whatever the caller passed', () => {
    expect(
      thresholdStanding({ doors: 0, walls: 0, balanceCents: 0, nothingOwed: false }),
    ).toBe('Nothing waits for your name.');
  });
});

describe('previouslyLine', () => {
  it('prints the label and the day', () => {
    expect(
      previouslyLine({ label: 'Fourteen selections agreed', date: new Date(2026, 5, 19) }),
    ).toBe('Previously — Fourteen selections agreed, 19 June.');
  });

  it('is silent with nothing behind the client', () => {
    expect(previouslyLine(null)).toBeNull();
  });
});

describe('keySentence', () => {
  it('counts two marks', () => {
    expect(keySentence(2)).toBe('Two marks stand open on this drawing.');
  });

  it('counts one mark', () => {
    expect(keySentence(1)).toBe('One mark stands open on this drawing.');
  });

  it('reports a clear drawing', () => {
    expect(keySentence(0)).toBe('Nothing stands open on this drawing.');
  });

  it('counts more than two in words', () => {
    expect(keySentence(4)).toBe('Four marks stand open on this drawing.');
  });
});

describe('thresholdStanding — a real ask is never silenced', () => {
  it('names the door even when the caller says nothing is owed', () => {
    expect(
      thresholdStanding({ doors: 1, walls: 0, balanceCents: 0, nothingOwed: true }),
    ).toBe('One door in this house is closed until you sign it.');
  });

  it('names finished work even when the caller says nothing is owed', () => {
    expect(
      thresholdStanding({ doors: 0, walls: 1, balanceCents: 912_500, nothingOwed: true }),
    ).toBe('Finished work waits for your acceptance.');
  });
});

describe('previouslyLine — what it will not print', () => {
  it('is silent on a label of nothing but space', () => {
    expect(previouslyLine({ label: '   ', date: new Date(2026, 5, 19) })).toBeNull();
  });

  it('is silent on a date it cannot read', () => {
    expect(previouslyLine({ label: 'Something agreed', date: new Date('nonsense') })).toBeNull();
  });
});

describe('keySentence — past twelve', () => {
  it('falls to figures', () => {
    expect(keySentence(13)).toBe('13 marks stand open on this drawing.');
  });
});

describe('houseOverageLine — the note under the ledger', () => {
  const band = (
    name: string,
    targetCents: number | null,
    agreedCents: number,
    varianceLine: string | null,
  ) => ({ name, targetCents, agreedCents, varianceLine });

  it('names the room past its target and the one absorbing it', () => {
    expect(
      houseOverageLine([
        band('The library', 2_380_000, 2_490_000, 'about eleven hundred past its target'),
        band('The bedroom', 2_000_000, 1_800_000, 'about two thousand under its target'),
      ]),
    ).toBe(
      'The library stands about eleven hundred past its target; the bedroom absorbs it.',
    );
  });

  it('stops at the overage when no room has the headroom to absorb it', () => {
    expect(
      houseOverageLine([
        band('Library', 2_380_000, 2_490_000, 'about eleven hundred past its target'),
        band('Bedroom', 2_000_000, 2_000_000, null),
      ]),
    ).toBe('The Library stands about eleven hundred past its target.');
  });

  it('says nothing when no room carries a target it has passed', () => {
    expect(houseOverageLine([])).toBeNull();
    expect(houseOverageLine([band('Library', null, 2_490_000, null)])).toBeNull();
    expect(
      houseOverageLine([
        band('Library', 2_380_000, 1_000_000, 'about fourteen hundred under its target'),
      ]),
    ).toBeNull();
  });
});
