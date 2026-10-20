import {
  bindCounts,
  electFfeLeader,
  ffeStateSentence,
  scanFfeExceptions,
  type FfeLeaderInput,
} from '../ffe-leader';
import type { NeedKind, NeedLine } from '../desk-derivation';

const need = (kind: NeedKind): NeedLine => ({
  kind,
  text: 'a need',
  actionLabel: null,
  stamp: { label: 'STAMP', color: 'var(--color-clay)' },
  urgent: false,
});

const input = (over: Partial<FfeLeaderInput> = {}): FfeLeaderInput => ({
  releaseLift: false,
  needs: [],
  unspecifiedLineIds: [],
  unpricedLineIds: [],
  awaitingCount: 0,
  uninvoicedLineIds: [],
  ...over,
});

describe('electFfeLeader — one case per state, in priority order', () => {
  it('elects the release over every exception standing (I141)', () => {
    const choice = electFfeLeader(
      input({
        releaseLift: true,
        needs: [need('damage_claim'), need('po_unacknowledged')],
        unspecifiedLineIds: ['line-1'],
        unpricedLineIds: ['line-3'],
        awaitingCount: 2,
        uninvoicedLineIds: ['line-2'],
      }),
    );
    expect(choice).toMatchObject({ state: 'release', kind: 'release', highlightLineId: null });
  });

  it('elects the damage claim over every softer exception', () => {
    const choice = electFfeLeader(
      input({
        needs: [need('damage_claim'), need('po_unacknowledged')],
        unspecifiedLineIds: ['line-1'],
        awaitingCount: 1,
        uninvoicedLineIds: ['line-2'],
      }),
    );
    expect(choice.kind).toBe('claim');
  });

  it('elects the unanswered PO when no claim stands', () => {
    const choice = electFfeLeader(
      input({
        needs: [need('po_unacknowledged')],
        unspecifiedLineIds: ['line-1'],
        uninvoicedLineIds: ['line-2'],
      }),
    );
    expect(choice.kind).toBe('po');
  });

  it('elects the unspecified line over the unpriced, waiting and uninvoiced ones', () => {
    const choice = electFfeLeader(
      input({
        unspecifiedLineIds: ['line-1'],
        unpricedLineIds: ['line-3'],
        awaitingCount: 1,
        uninvoicedLineIds: ['line-2'],
      }),
    );
    expect(choice.kind).toBe('spec');
    expect(choice.highlightLineId).toBe('line-1');
  });

  it('elects the missing price over the client’s turn and the bill', () => {
    const choice = electFfeLeader(
      input({ unpricedLineIds: ['line-3'], awaitingCount: 1, uninvoicedLineIds: ['line-2'] }),
    );
    expect(choice).toMatchObject({ state: 'price', kind: 'price', highlightLineId: 'line-3' });
  });

  it('names the client’s turn and elects no lead, never falling to the bill', () => {
    const choice = electFfeLeader(input({ awaitingCount: 2, uninvoicedLineIds: ['line-2'] }));
    expect(choice).toMatchObject({ state: 'waiting', kind: null, highlightLineId: null });
  });

  it('elects no lead for a release held by its prerequisite, even with lines to bill', () => {
    const choice = electFfeLeader(input({ releaseHeld: true, uninvoicedLineIds: ['line-2'] }));
    expect(choice).toMatchObject({ state: 'held', kind: null });
  });

  it('lets a missing price lead over a held release', () => {
    const choice = electFfeLeader(input({ releaseHeld: true, unpricedLineIds: ['line-3'] }));
    expect(choice.kind).toBe('price');
  });

  it('elects the uninvoiced line when it is the only exception', () => {
    const choice = electFfeLeader(input({ uninvoicedLineIds: ['line-2'] }));
    expect(choice.kind).toBe('bill');
    expect(choice.highlightLineId).toBe('line-2');
  });

  it('falls to Add items on an empty schedule', () => {
    const choice = electFfeLeader(input({ emptySchedule: true }));
    expect(choice).toMatchObject({ state: 'add-line', kind: 'add-line', highlightLineId: null });
    expect(choice.exceptions).toHaveLength(0);
  });

  it('falls to Add items, naming a settled state, when nothing stands on a full schedule', () => {
    const choice = electFfeLeader(input());
    expect(choice).toMatchObject({ state: 'settled', kind: 'add-line' });
  });

  it('points at no line for a claim the scan carries no line id for', () => {
    const choice = electFfeLeader(input({ needs: [need('damage_claim')] }));
    expect(choice.highlightLineId).toBeNull();
  });

  it('ignores needs that are not FF&E exceptions', () => {
    const choice = electFfeLeader(input({ needs: [need('po_unsent'), need('pulse_due')] }));
    expect(choice.kind).toBe('add-line');
  });
});

describe('electFfeLeader — a job on hold or closed', () => {
  it.each(['on-hold', 'closed'] as const)(
    'elects no lead on a %s job, even with a release, a price or a bill standing',
    (job) => {
      const choice = electFfeLeader(
        input({ job, releaseLift: true, unpricedLineIds: ['line-3'], uninvoicedLineIds: ['line-2'] }),
      );
      expect(choice).toMatchObject({ state: job, kind: null });
    },
  );

  it('still leads a held job with its damage claim or unanswered PO', () => {
    expect(electFfeLeader(input({ job: 'on-hold', needs: [need('damage_claim')] })).kind).toBe(
      'claim',
    );
    expect(electFfeLeader(input({ job: 'closed', needs: [need('po_unacknowledged')] })).kind).toBe(
      'po',
    );
  });
});

describe('electFfeLeader — the release lift', () => {
  it('still reports the exceptions it outranked, so the head can print them', () => {
    const choice = electFfeLeader(input({ releaseLift: true, needs: [need('damage_claim')] }));
    expect(choice.exceptions.map((e) => e.kind)).toEqual(['claim']);
  });
});

describe('electFfeLeader — every shape of input', () => {
  const flags = [false, true];
  const ids = [[], ['line-1']];

  it('elects only from the ranked acts, and leads with nothing only where nothing can be pressed', () => {
    const kinds = new Set<string | null>();
    for (const releaseLift of flags) {
      for (const claim of flags) {
        for (const releaseHeld of flags) {
          for (const awaitingCount of [0, 1]) {
            for (const unpricedLineIds of ids) {
              for (const uninvoicedLineIds of ids) {
                const choice = electFfeLeader(
                  input({
                    releaseLift,
                    releaseHeld,
                    awaitingCount,
                    unpricedLineIds,
                    uninvoicedLineIds,
                    needs: claim ? [need('damage_claim')] : [],
                  }),
                );
                kinds.add(choice.kind);
                if (choice.kind === null) expect(['waiting', 'held']).toContain(choice.state);
              }
            }
          }
        }
      }
    }
    expect([...kinds]).toEqual(
      expect.arrayContaining(['release', 'claim', 'price', 'bill', 'add-line', null]),
    );
    expect(kinds.size).toBe(6);
  });
});

describe('ffeStateSentence — one plain sentence per state', () => {
  const sentence = (over: Partial<FfeLeaderInput>, released = 0) =>
    ffeStateSentence(electFfeLeader(input(over)), released);

  it('says the selections are priced and nothing is released (the pilot’s priced state)', () => {
    expect(sentence({ releaseLift: true })).toBe('The selections are priced. Nothing is released.');
  });

  it('names a missing price, the client’s turn and a held release', () => {
    expect(sentence({ unpricedLineIds: ['a'] })).toBe(
      'One selection still needs a confirmed price.',
    );
    expect(sentence({ awaitingCount: 2 })).toBe(
      '2\u00a0selections are with the client for purchasing approval.',
    );
    expect(sentence({ releaseHeld: true })).toBe(
      'Selections are ready, but purchasing authorization is held.',
    );
  });

  it('counts what is standing in words', () => {
    expect(sentence({ needs: [need('damage_claim'), need('damage_claim')] })).toBe(
      '2\u00a0damage claims are open.',
    );
    expect(sentence({ uninvoicedLineIds: ['a'] })).toBe(
      'One priced selection is not yet invoiced.',
    );
    expect(sentence({ emptySchedule: true })).toBe('No selections yet.');
    expect(sentence({}, 3)).toBe('3\u00a0selections are released.');
    expect(sentence({ job: 'on-hold' })).toBe('The job is on hold.');
  });

  it('binds each count to its noun so a wrap never strands the number', () => {
    expect(sentence({ uninvoicedLineIds: ['a', 'b'] })).toBe(
      '2 priced selections are not yet invoiced.',
    );
    expect(bindCounts('2 specced · 1 released')).toBe('2 specced · 1 released');
    expect(bindCounts('nothing released')).toBe('nothing released');
  });
});

describe('scanFfeExceptions — the head’s second line', () => {
  it('orders every exception sharpest first and counts each in words', () => {
    const exceptions = scanFfeExceptions(
      input({
        needs: [need('damage_claim'), need('damage_claim'), need('po_unacknowledged')],
        unspecifiedLineIds: ['a', 'b'],
        unpricedLineIds: ['f'],
        awaitingCount: 2,
        uninvoicedLineIds: ['c', 'd', 'e'],
      }),
    );
    expect(exceptions.map((e) => e.text)).toEqual([
      '2 open damage claims',
      '1 PO unanswered',
      '2 placeholders',
      '1 unpriced',
      '2 awaiting authorization',
      '3 uninvoiced',
    ]);
  });

  it('keeps the singular where there is one of a thing', () => {
    const exceptions = scanFfeExceptions(
      input({ needs: [need('damage_claim')], uninvoicedLineIds: ['c'] }),
    );
    expect(exceptions.map((e) => e.text)).toEqual(['1 open damage claim', '1 uninvoiced']);
  });
});
