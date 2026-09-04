import { keySentence, previouslyLine, thresholdStanding } from '../standing';

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
