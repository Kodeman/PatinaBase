import {
  electFfeLeader,
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
  uninvoicedLineIds: [],
  ...over,
});

describe('electFfeLeader — one case per exception class', () => {
  it('elects the damage claim over every softer exception', () => {
    const choice = electFfeLeader(
      input({
        needs: [need('damage_claim'), need('po_unacknowledged')],
        unspecifiedLineIds: ['line-1'],
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

  it('elects the unspecified line over the uninvoiced one', () => {
    const choice = electFfeLeader(
      input({
        unspecifiedLineIds: ['line-1'],
        uninvoicedLineIds: ['line-2'],
      }),
    );
    expect(choice.kind).toBe('spec');
    expect(choice.highlightLineId).toBe('line-1');
  });

  it('elects the uninvoiced line when it is the only exception', () => {
    const choice = electFfeLeader(input({ uninvoicedLineIds: ['line-2'] }));
    expect(choice.kind).toBe('bill');
    expect(choice.highlightLineId).toBe('line-2');
  });

  it('falls to Add a line when the spread carries no exception', () => {
    const choice = electFfeLeader(input());
    expect(choice.kind).toBe('add-line');
    expect(choice.highlightLineId).toBeNull();
    expect(choice.exceptions).toHaveLength(0);
  });

  it('points at no line for a claim the scan carries no line id for', () => {
    const choice = electFfeLeader(input({ needs: [need('damage_claim')] }));
    expect(choice.highlightLineId).toBeNull();
  });

  it('ignores needs that are not FF&E exceptions', () => {
    const choice = electFfeLeader(
      input({ needs: [need('po_unsent'), need('pulse_due')] }),
    );
    expect(choice.kind).toBe('add-line');
  });
});

describe('electFfeLeader — the release lift', () => {
  it('yields to the release lift even with the sharpest exception standing', () => {
    const choice = electFfeLeader(
      input({
        releaseLift: true,
        needs: [need('damage_claim')],
        unspecifiedLineIds: ['line-1'],
        uninvoicedLineIds: ['line-2'],
      }),
    );
    expect(choice.kind).toBe('release');
    expect(choice.highlightLineId).toBeNull();
  });

  it('still reports the exceptions it yielded to, so the head can print them', () => {
    const choice = electFfeLeader(
      input({ releaseLift: true, needs: [need('damage_claim')] }),
    );
    expect(choice.exceptions.map((e) => e.kind)).toEqual(['claim']);
  });
});

describe('electFfeLeader — exactly one leader, always', () => {
  const flags = [false, true];
  const ids = [[], ['line-1']];

  it('returns one leader for every shape of input', () => {
    const kinds = new Set<string>();
    for (const releaseLift of flags) {
      for (const claim of flags) {
        for (const po of flags) {
          for (const unspecifiedLineIds of ids) {
            for (const uninvoicedLineIds of ids) {
              const choice = electFfeLeader(
                input({
                  releaseLift,
                  needs: [
                    ...(claim ? [need('damage_claim')] : []),
                    ...(po ? [need('po_unacknowledged')] : []),
                  ],
                  unspecifiedLineIds,
                  uninvoicedLineIds,
                }),
              );
              expect(typeof choice.kind).toBe('string');
              kinds.add(choice.kind);
            }
          }
        }
      }
    }
    expect([...kinds].sort()).toEqual(
      ['add-line', 'bill', 'claim', 'po', 'release', 'spec'].sort(),
    );
  });
});

describe('scanFfeExceptions — the head’s second line', () => {
  it('orders every exception sharpest first and counts each in words', () => {
    const exceptions = scanFfeExceptions(
      input({
        needs: [
          need('damage_claim'),
          need('damage_claim'),
          need('po_unacknowledged'),
        ],
        unspecifiedLineIds: ['a', 'b'],
        uninvoicedLineIds: ['c', 'd', 'e'],
      }),
    );
    expect(exceptions.map((e) => e.text)).toEqual([
      '2 open damage claims',
      '1 PO unanswered',
      '2 unspecified',
      '3 uninvoiced',
    ]);
  });

  it('keeps the singular where there is one of a thing', () => {
    const exceptions = scanFfeExceptions(
      input({ needs: [need('damage_claim')], uninvoicedLineIds: ['c'] }),
    );
    expect(exceptions.map((e) => e.text)).toEqual([
      '1 open damage claim',
      '1 uninvoiced',
    ]);
  });
});
