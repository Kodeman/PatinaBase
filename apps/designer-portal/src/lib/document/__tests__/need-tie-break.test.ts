import { needTieBreakRank, rankOperationalNeeds } from '../need-tie-break';
import type { NeedKind, NeedLine } from '../desk-derivation';

const NOW = new Date('2026-08-25T12:00:00Z');

const need = (kind: NeedKind, text = kind): NeedLine => ({
  kind,
  text,
  actionLabel: null,
  stamp: { label: kind.toUpperCase(), color: 'var(--color-clay)' },
  urgent: false,
});

const kinds = (needs: readonly NeedLine[]) => needs.map((n) => n.kind);

describe('rankOperationalNeeds', () => {
  it('leads with a hard outside deadline, whoever owns it', () => {
    // Rank 1 — a carrier window, a delivery inspection, an install-blocking
    // collision, an inquiry's response deadline.
    expect(needTieBreakRank('damage_claim')).toBe(1);
    expect(needTieBreakRank('awaiting_inspection')).toBe(1);
    expect(needTieBreakRank('schedule_conflict')).toBe(1);
    expect(needTieBreakRank('new_lead')).toBe(1);
  });

  it('puts what the studio can move today under the outside deadline', () => {
    expect(needTieBreakRank('po_unsent')).toBe(2);
    expect(needTieBreakRank('pulse_due')).toBe(2);
    expect(needTieBreakRank('proposal_signed')).toBe(2);
  });

  it('puts what is already overdue under the studio\'s own pen', () => {
    expect(needTieBreakRank('overdue_decision')).toBe(3);
    expect(needTieBreakRank('overdue_invoice')).toBe(3);
    expect(needTieBreakRank('task_due')).toBe(3);
  });

  it('puts undated setup chores last', () => {
    expect(needTieBreakRank('schedule_unconfigured')).toBe(4);
  });

  it('does not let a one-day-old studio chore outrank a three-week-overdue client decision', () => {
    // C-AP-06's own falsifier: v1 ranked ownership first, which promoted the
    // undated chore. The chore now sorts last whichever order it arrives in.
    const chore = need('schedule_unconfigured', 'Set up the schedule');
    const decision = need('overdue_decision', '1 decision overdue — oldest due Aug 4');

    expect(kinds(rankOperationalNeeds([chore, decision], NOW))).toEqual([
      'overdue_decision',
      'schedule_unconfigured',
    ]);
    expect(kinds(rankOperationalNeeds([decision, chore], NOW))).toEqual([
      'overdue_decision',
      'schedule_unconfigured',
    ]);
  });

  it.each([
    ['damage_claim', 'po_unsent'],
    ['damage_claim', 'overdue_decision'],
    ['damage_claim', 'schedule_unconfigured'],
    ['po_unsent', 'overdue_decision'],
    ['po_unsent', 'schedule_unconfigured'],
    ['overdue_decision', 'schedule_unconfigured'],
  ] as const)('keeps %s above %s whichever way round they arrive', (higher, lower) => {
    expect(kinds(rankOperationalNeeds([need(lower), need(higher)], NOW))).toEqual([higher, lower]);
    expect(kinds(rankOperationalNeeds([need(higher), need(lower)], NOW))).toEqual([higher, lower]);
  });

  it('is stable inside a rank, so the composition\'s own dated order survives', () => {
    const older = need('overdue_decision', '3 decisions overdue — oldest due Aug 1');
    const newer = need('overdue_invoice', 'INV-204 is 2 days past due');
    const newest = need('task_due', 'Confirm trim — due Aug 25');

    expect(rankOperationalNeeds([older, newer, newest], NOW)).toEqual([older, newer, newest]);
    expect(rankOperationalNeeds([newest, older, newer], NOW)).toEqual([newest, older, newer]);
  });

  it('returns every need it was given, exactly once', () => {
    const all: NeedLine[] = [
      need('schedule_unconfigured'),
      need('overdue_decision'),
      need('damage_claim'),
      need('po_unsent'),
      need('new_lead'),
      need('pulse_due'),
      need('task_due'),
    ];
    const ranked = rankOperationalNeeds(all, NOW);

    expect(ranked).toHaveLength(all.length);
    expect(new Set(ranked)).toEqual(new Set(all));
    expect(kinds(ranked)).toEqual([
      'damage_claim',
      'new_lead',
      'po_unsent',
      'pulse_due',
      'overdue_decision',
      'task_due',
      'schedule_unconfigured',
    ]);
  });

  it('ranks a need carrying no date at all rather than dropping it', () => {
    // Nothing in NeedLine states a date; the undated setup chore is the kind
    // that has none even in its prose, and it still comes back ranked.
    const undated = need('schedule_unconfigured', 'This project has no schedule yet');

    expect(rankOperationalNeeds([undated], NOW)).toEqual([undated]);
  });

  it('answers an empty list with an empty list', () => {
    expect(rankOperationalNeeds([], NOW)).toEqual([]);
  });

  it('does not mutate its input', () => {
    const input: NeedLine[] = [need('schedule_unconfigured'), need('damage_claim')];
    rankOperationalNeeds(input, NOW);

    expect(kinds(input)).toEqual(['schedule_unconfigured', 'damage_claim']);
  });
});
