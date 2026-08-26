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
    // collision.
    expect(needTieBreakRank('damage_claim')).toBe(1);
    expect(needTieBreakRank('awaiting_inspection')).toBe(1);
    expect(needTieBreakRank('schedule_conflict')).toBe(1);
  });

  it('puts what is already past its date under the outside deadline', () => {
    expect(needTieBreakRank('overdue_decision')).toBe(2);
    expect(needTieBreakRank('overdue_invoice')).toBe(2);
    expect(needTieBreakRank('task_due')).toBe(2);
    expect(needTieBreakRank('po_unacknowledged')).toBe(2);
  });

  it('puts what the studio can move today under what is overdue', () => {
    expect(needTieBreakRank('po_unsent')).toBe(3);
    expect(needTieBreakRank('pulse_due')).toBe(3);
    expect(needTieBreakRank('proposal_signed')).toBe(3);
  });

  it('ranks a new lead with the studio\'s own pen, not with the outside clocks', () => {
    // `needLead` raises new_lead for any new/viewed lead, dated or not
    // ("New lead — respond"), so the kind states no deadline to lead on.
    expect(needTieBreakRank('new_lead')).toBe(3);
  });

  it('puts undated setup chores last', () => {
    expect(needTieBreakRank('schedule_unconfigured')).toBe(4);
  });

  it('does not let a one-day-old studio chore outrank a three-week-overdue client decision', () => {
    // The plan's own falsifier, with the plan's own pairing: the chore is the
    // designer's unsent PO, the decision is three weeks past its date.
    const chore = need('po_unsent', 'A purchase order has waited 1 day unsent');
    const decision = need('overdue_decision', '1 decision overdue — oldest due Aug 4');

    expect(kinds(rankOperationalNeeds([chore, decision], NOW))).toEqual([
      'overdue_decision',
      'po_unsent',
    ]);
    expect(kinds(rankOperationalNeeds([decision, chore], NOW))).toEqual([
      'overdue_decision',
      'po_unsent',
    ]);
  });

  it.each([
    ['damage_claim', 'po_unsent'],
    ['damage_claim', 'overdue_decision'],
    ['damage_claim', 'schedule_unconfigured'],
    ['overdue_decision', 'po_unsent'],
    ['overdue_decision', 'schedule_unconfigured'],
    ['po_unsent', 'schedule_unconfigured'],
  ] as const)('keeps %s above %s whichever way round they arrive', (higher, lower) => {
    expect(kinds(rankOperationalNeeds([need(lower), need(higher)], NOW))).toEqual([higher, lower]);
    expect(kinds(rankOperationalNeeds([need(higher), need(lower)], NOW))).toEqual([higher, lower]);
  });

  it('is stable inside a rank, so the derivation chain\'s own order survives', () => {
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
      'overdue_decision',
      'task_due',
      'po_unsent',
      'new_lead',
      'pulse_due',
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

  describe('A3-L7 — dueOn/owner rank', () => {
    const dated = (
      kind: NeedKind,
      dueOn: string | null,
      owner: NeedLine['owner'],
      text = kind,
    ): NeedLine => ({ ...need(kind, text), dueOn, owner });

    it('ranks a dueOn within seven days, owned by someone other than the designer, first', () => {
      // Otherwise-designer-owned kinds (rank 3 by kind) still lead when a
      // maker's carrier window closes inside the week.
      const chore = dated('po_unsent', null, 'designer', 'A PO drafted 1 day ago');
      const window = dated('po_unacknowledged', '2026-08-28', 'maker', 'The carrier window closes in 3 days');

      expect(kinds(rankOperationalNeeds([chore, window], NOW))).toEqual([
        'po_unacknowledged',
        'po_unsent',
      ]);
    });

    it('treats a dueOn eight days out as not a hard deadline (the seven-day boundary)', () => {
      const withinWeek = dated('overdue_invoice', '2026-09-01', 'client', 'due in 7 days');
      const pastWeek = dated('overdue_invoice', '2026-09-02', 'client', 'due in 8 days');

      // Seven days out (inclusive) is rank 1; eight days out has no
      // non-designer-owned rank-1 case to win, and (owner !== 'designer',
      // dueOn not yet past) falls to rank 4.
      expect(kinds(rankOperationalNeeds([pastWeek, withinWeek], NOW))).toEqual([
        'overdue_invoice',
        'overdue_invoice',
      ]);
      const [first] = rankOperationalNeeds([pastWeek, withinWeek], NOW);
      expect(first).toBe(withinWeek);
    });

    it('ranks a designer-owned need second regardless of its date', () => {
      const designerFuture = dated('task_due', '2026-09-20', 'designer', 'Confirm trim');
      const clientOverdue = dated('overdue_decision', '2026-08-01', 'client', 'oldest due Aug 1');

      // A client-owned overdue date is rank 3, under the designer's own act.
      expect(kinds(rankOperationalNeeds([clientOverdue, designerFuture], NOW))).toEqual([
        'task_due',
        'overdue_decision',
      ]);
    });

    it('ranks a past dueOn third, oldest first, when no rank 1 or 2 applies', () => {
      const older = dated('overdue_decision', '2026-08-01', 'client', 'oldest due Aug 1');
      const newer = dated('overdue_invoice', '2026-08-15', 'client', 'INV-204');

      expect(kinds(rankOperationalNeeds([newer, older], NOW))).toEqual([
        'overdue_decision',
        'overdue_invoice',
      ]);
      expect(kinds(rankOperationalNeeds([older, newer], NOW))).toEqual([
        'overdue_decision',
        'overdue_invoice',
      ]);
    });

    it('falls back to the kind-based rank when a need carries neither dueOn nor owner', () => {
      // The falsifier from A1-L2, unaffected by the dueOn/owner rank because
      // neither need here states either field.
      const chore = need('po_unsent', 'A purchase order has waited 1 day unsent');
      const decision = need('overdue_decision', '1 decision overdue — oldest due Aug 4');

      expect(kinds(rankOperationalNeeds([chore, decision], NOW))).toEqual([
        'overdue_decision',
        'po_unsent',
      ]);
    });

    it('lands a dated-but-unowned need in the same rank-4 bucket as a plain undated need', () => {
      const futureNoOwner = dated('schedule_conflict', '2026-09-20', undefined, 'A far-off date, no owner');
      const undatedChore = need('schedule_unconfigured', 'No schedule yet');

      // schedule_conflict is kind-rank 1 on its own, but a distant, unowned
      // dueOn drops it out of the dueOn/owner rank's top three buckets into
      // rank 4 — the same bucket a plain undated need falls into by kind —
      // so declaration order (not the kind's usual precedence) decides.
      expect(kinds(rankOperationalNeeds([futureNoOwner, undatedChore], NOW))).toEqual([
        'schedule_conflict',
        'schedule_unconfigured',
      ]);
      expect(kinds(rankOperationalNeeds([undatedChore, futureNoOwner], NOW))).toEqual([
        'schedule_unconfigured',
        'schedule_conflict',
      ]);
    });
  });
});
