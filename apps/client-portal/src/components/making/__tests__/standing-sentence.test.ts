import {
  countInWords,
  joinClauses,
  moneyInWords,
  monthAndYear,
  standingSentence,
  standingSubline,
  todayInWords,
  type StandingSentenceInput,
} from '../standing-sentence';

/**
 * The quiet house: a real project on a day when nothing is moving. Every case
 * below is this, plus the one or two facts under test — which is also the point
 * of the sentence. It has to read for the empty project and the busy one.
 */
function quietHouse(overrides: Partial<StandingSentenceInput> = {}): StandingSentenceInput {
  return {
    todayLabel: 'the fifth of August',
    signatureCount: 0,
    acceptanceCount: 0,
    inProduction: [],
    shipped: [],
    delivered: [],
    openBalanceCents: 0,
    nextMilestone: null,
    ...overrides,
  };
}

describe('standingSentence', () => {
  it('speaks the deck sentence: one named piece being made, two papers waiting', () => {
    const sentence = standingSentence(
      quietHouse({ inProduction: ['credenza'], signatureCount: 2 }),
    );

    expect(sentence).toBe(
      'It is the fifth of August. Your credenza is in production, and two papers wait for your name.',
    );
  });

  it('says so plainly when nothing at all is moving', () => {
    expect(standingSentence(quietHouse())).toBe(
      'It is the fifth of August. Nothing waits on you today.',
    );
  });

  it('never prints a zero for a cardinality that has nothing to say', () => {
    const sentence = standingSentence(quietHouse({ signatureCount: 0, openBalanceCents: 0 }));

    expect(sentence).not.toMatch(/\b0\b/);
    expect(sentence).not.toMatch(/zero/i);
    expect(sentence).not.toMatch(/no pieces|0 items/i);
  });

  it('keeps one gate singular', () => {
    expect(standingSentence(quietHouse({ signatureCount: 1 }))).toBe(
      'It is the fifth of August. One paper waits for your name.',
    );
  });

  it('never calls finished work a paper — an acceptance has no document', () => {
    const sentence = standingSentence(quietHouse({ acceptanceCount: 1 }));

    expect(sentence).toBe(
      'It is the fifth of August. Finished work waits for your acceptance.',
    );
    expect(sentence).not.toMatch(/paper/i);
  });

  it('counts several scopes of finished work without calling them papers', () => {
    expect(standingSentence(quietHouse({ acceptanceCount: 2 }))).toBe(
      'It is the fifth of August. Two scopes of finished work wait for your acceptance.',
    );
  });

  it('speaks the two asks separately when both stand', () => {
    expect(
      standingSentence(quietHouse({ signatureCount: 1, acceptanceCount: 1 })),
    ).toBe(
      'It is the fifth of August. One paper waits for your name, ' +
        'and finished work waits for your acceptance.',
    );
  });

  it('joins three clauses with the serial comma, in the ruling order', () => {
    const sentence = standingSentence(
      quietHouse({
        inProduction: ['walnut credenza'],
        delivered: ['kilim rug'],
        signatureCount: 2,
      }),
    );

    expect(sentence).toBe(
      'It is the fifth of August. Your walnut credenza is in production, ' +
        'your kilim rug has arrived, and two papers wait for your name.',
    );
  });

  it('runs every clause in order — goods, then the ask, then the money', () => {
    const sentence = standingSentence(
      quietHouse({
        inProduction: ['credenza'],
        shipped: ['pair of reading chairs'],
        delivered: ['kilim rug'],
        signatureCount: 2,
        openBalanceCents: 912_500,
      }),
    );

    expect(sentence).toBe(
      'It is the fifth of August. Your credenza is in production, ' +
        'your pair of reading chairs is on its way, your kilim rug has arrived, ' +
        'two papers wait for your name, and a balance of $9,125 stands open.',
    );
  });

  it('counts pieces in words rather than naming them once there are several', () => {
    const sentence = standingSentence(
      quietHouse({
        inProduction: ['credenza', 'sconces', 'runner'],
        shipped: ['chairs', 'drapery'],
      }),
    );

    expect(sentence).toBe(
      'It is the fifth of August. Three pieces are in production, and two pieces are on their way.',
    );
  });

  it('falls back to the count when the one piece has no usable name', () => {
    expect(standingSentence(quietHouse({ inProduction: ['   '] }))).toBe(
      'It is the fifth of August. One piece is in production.',
    );
  });

  it('names the open balance on its own when it is the only thing standing', () => {
    expect(standingSentence(quietHouse({ openBalanceCents: 1_825_000 }))).toBe(
      'It is the fifth of August. A balance of $18,250 stands open.',
    );
  });

  it('ignores a balance that is settled or credited', () => {
    expect(standingSentence(quietHouse({ openBalanceCents: 0 }))).toContain(
      'Nothing waits on you today.',
    );
    expect(standingSentence(quietHouse({ openBalanceCents: -4_200 }))).toContain(
      'Nothing waits on you today.',
    );
  });

  it('adds the next milestone with its date when the schedule has one', () => {
    const sentence = standingSentence(
      quietHouse({
        signatureCount: 1,
        nextMilestone: { title: 'Installation', whenLabel: 'the week of October 12' },
      }),
    );

    expect(sentence).toBe(
      'It is the fifth of August. One paper waits for your name. ' +
        'Installation comes next, the week of October 12.',
    );
  });

  it('drops the date clause when the milestone has no target', () => {
    const sentence = standingSentence(
      quietHouse({ nextMilestone: { title: 'Installation', whenLabel: null } }),
    );

    expect(sentence).toBe(
      'It is the fifth of August. Nothing waits on you today. Installation comes next.',
    );
  });

  it('omits the date sentence entirely when today is unknown', () => {
    expect(standingSentence(quietHouse({ todayLabel: '', signatureCount: 2 }))).toBe(
      'Two papers wait for your name.',
    );
  });

  it('survives a caller that hands it nothing but the date', () => {
    const bare = { todayLabel: 'the first of January' } as unknown as StandingSentenceInput;

    expect(standingSentence(bare)).toBe(
      'It is the first of January. Nothing waits on you today.',
    );
  });
});

describe('standingSubline', () => {
  it('carries both counts when both stand, and the count keeps its noun', () => {
    expect(standingSubline(quietHouse({ signatureCount: 2, openBalanceCents: 912_500 }))).toEqual([
      '2 unanswered',
      'balance of $9,125 open',
    ]);
  });

  it('sums papers and acceptances into one tally', () => {
    expect(
      standingSubline(quietHouse({ signatureCount: 2, acceptanceCount: 1 })),
    ).toEqual(['3 unanswered']);
  });

  it('drops the balance segment when nothing is owed', () => {
    expect(standingSubline(quietHouse({ signatureCount: 1 }))).toEqual(['1 unanswered']);
  });

  it('drops the gate segment when nothing awaits a hand', () => {
    expect(standingSubline(quietHouse({ openBalanceCents: 144_000 }))).toEqual([
      'balance of $1,440 open',
    ]);
  });

  it('says nothing at all when the sentence above has already said it', () => {
    // "Nothing awaits your hand" under "Nothing waits on you today." is the
    // same negation twice in two typefaces — a stutter, not calm.
    expect(standingSubline(quietHouse())).toEqual([]);
  });
});

describe('joinClauses', () => {
  it.each([
    [[], ''],
    [['one paper waits'], 'one paper waits'],
    [['a is here', 'b waits'], 'a is here, and b waits'],
    [['a is here', 'b is here', 'c waits'], 'a is here, b is here, and c waits'],
    [['a', 'b', 'c', 'd'], 'a, b, c, and d'],
  ])('joins %j', (clauses, expected) => {
    expect(joinClauses(clauses as string[])).toBe(expected);
  });
});

describe('todayInWords', () => {
  it.each([
    [new Date(2026, 7, 5), 'the fifth of August'],
    [new Date(2026, 0, 1), 'the first of January'],
    [new Date(2026, 1, 2), 'the second of February'],
    [new Date(2026, 2, 3), 'the third of March'],
    [new Date(2026, 9, 21), 'the twenty-first of October'],
    [new Date(2026, 11, 31), 'the thirty-first of December'],
  ])('reads %s in words', (date, expected) => {
    expect(todayInWords(date)).toBe(expected);
  });
});

describe('monthAndYear', () => {
  it('closes the vitals line', () => {
    expect(monthAndYear(new Date(2026, 7, 5))).toBe('August 2026');
  });
});

describe('countInWords', () => {
  it.each([
    [0, 'zero'],
    [1, 'one'],
    [2, 'two'],
    [12, 'twelve'],
    [13, '13'],
    [40, '40'],
  ])('says %i', (count, expected) => {
    expect(countInWords(count)).toBe(expected);
  });
});

describe('moneyInWords', () => {
  it('prints whole grouped dollars the way the deck does', () => {
    expect(moneyInWords(912_500)).toBe('$9,125');
    expect(moneyInWords(8_500_000)).toBe('$85,000');
    expect(moneyInWords(0)).toBe('$0');
  });

  it('rounds cents away rather than printing them', () => {
    expect(moneyInWords(912_549)).toBe('$9,125');
  });
});
