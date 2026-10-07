import type { OwnAct } from '../act-names';
import { NEED_ACTION_LABELS, type NeedKind } from '../desk-derivation';
import {
  NEED_CLASS,
  classOfNeed,
  classOfStandingRow,
  compareForNext,
  selectNext,
  type NextChoice,
  type SetupRow,
  type StandingNeedRow,
  type StandingRow,
} from '../need-class';

const need = (
  needKind: NeedKind | null,
  over: Partial<StandingNeedRow> = {},
): StandingNeedRow => ({
  needKind,
  tier: 'decision-due',
  sense: 'none',
  distance: null,
  standingSince: null,
  ...over,
});

const setup = (kind: SetupRow['setup']): SetupRow => ({
  setup: kind,
  sense: 'none',
  distance: null,
  standingSince: null,
});

const own: OwnAct = {
  label: 'Spec the 3 unspecified',
  targetId: 'document-act-pieces-head',
  tier: 'scored',
};

const always = () => true;

describe('NEED_CLASS (D2 class table)', () => {
  it('is exhaustive over NeedKind', () => {
    // NEED_ACTION_LABELS is the existing Record<NeedKind, …>: the same key set.
    expect(Object.keys(NEED_CLASS).sort()).toEqual(Object.keys(NEED_ACTION_LABELS).sort());
  });

  it.each<[NeedKind, 1 | 2 | 3]>([
    ['payment_due', 1],
    ['payment_failed', 1],
    ['overdue_invoice', 1],
    ['hesitating_proposal', 1],
    ['proposal_expired', 1],
    ['proposal_declined', 1],
    ['quote_expiring', 1],
    ['return_by', 1],
    ['overdue_decision', 2],
    ['claim_window', 2],
    ['damage_claim', 2],
    ['lines_flagged', 2],
    ['awaiting_inspection', 2],
    ['schedule_conflict', 2],
    ['schedule_proposal', 2],
    ['task_due', 2],
    ['po_unsent', 2],
    ['po_unacknowledged', 2],
    ['ack_discrepancy', 2],
    ['cfa_pending', 2],
    ['memo_return', 2],
    ['exception_open', 2],
    ['proposal_signed', 2],
    ['new_lead', 2],
    ['ceremony_pending', 2],
    ['reconnect_due', 2],
    ['pulse_due', 2],
    ['schedule_unconfigured', 3],
  ])('%s is class %i', (kind, cls) => {
    expect(classOfNeed(kind)).toBe(cls);
  });
});

describe('classOfStandingRow', () => {
  it('puts the setup rows in class 3', () => {
    expect(classOfStandingRow(setup('no_client_linked'))).toBe(3);
    expect(classOfStandingRow(setup('budget_band_unset'))).toBe(3);
    expect(classOfStandingRow(setup('target_date_unset'))).toBe(3);
  });

  it('puts a bare tier with no kind in class 2', () => {
    expect(classOfStandingRow(need(null, { tier: 'overdue' }))).toBe(2);
    expect(classOfStandingRow(need(null, { tier: 'po-silence' }))).toBe(2);
  });

  it('reads the kind, never the tier', () => {
    expect(classOfStandingRow(need('damage_claim', { tier: 'damage' }))).toBe(2);
    expect(classOfStandingRow(need('quote_expiring', { tier: 'decision-due' }))).toBe(1);
  });
});

describe('compareForNext', () => {
  it('orders by class, then W3-R1 deadline order inside a class', () => {
    const ahead1 = need('task_due', { sense: 'ahead', distance: 1 });
    const past9 = need('overdue_decision', { sense: 'past', distance: -9 });
    const past2 = need('lines_flagged', { sense: 'past', distance: -2 });
    const silenceOld = need('po_unacknowledged', { standingSince: '2026-09-01' });
    const silenceNew = need('po_unsent', { standingSince: '2026-10-01' });
    const money = need('return_by', { sense: 'ahead', distance: 30 });
    const rows: StandingRow[] = [silenceNew, ahead1, past2, money, silenceOld, past9];
    expect([...rows].sort(compareForNext)).toEqual([
      money,
      past9,
      past2,
      ahead1,
      silenceOld,
      silenceNew,
    ]);
  });
});

describe('selectNext (D2 Next order)', () => {
  it('lets a class-1 need beat the stage own act', () => {
    const due = need('payment_due', { sense: 'past', distance: -148 });
    expect(selectNext({ needs: [due], ownAct: own, canTake: always, closed: false })).toEqual({
      kind: 'need',
      row: due,
    });
  });

  it('takes class 1 before class 2, and class 2 before the own act', () => {
    const claim = need('damage_claim', { sense: 'past', distance: -30 });
    const invoice = need('overdue_invoice', { sense: 'past', distance: -1 });
    expect(
      selectNext({ needs: [claim, invoice], ownAct: own, canTake: always, closed: false }),
    ).toEqual({ kind: 'need', row: invoice });
    expect(selectNext({ needs: [claim], ownAct: own, canTake: always, closed: false })).toEqual({
      kind: 'need',
      row: claim,
    });
  });

  it('takes the own act over setup on a quiet job', () => {
    const rows = [setup('no_client_linked'), need('schedule_unconfigured')];
    expect(selectNext({ needs: rows, ownAct: own, canTake: always, closed: false })).toEqual({
      kind: 'own',
      act: own,
    });
  });

  it('never makes setup Next while anything in classes 1–2 or an own act stands, even gated', () => {
    const rows: StandingRow[] = [setup('no_client_linked'), need('task_due')];
    const onlySetup = (choice: NextChoice<StandingRow>) =>
      choice.kind === 'need' && 'setup' in choice.row;
    expect(selectNext({ needs: rows, ownAct: null, canTake: onlySetup, closed: false })).toBeNull();
    expect(
      selectNext({ needs: [setup('budget_band_unset')], ownAct: own, canTake: onlySetup, closed: false }),
    ).toBeNull();
  });

  it('makes setup Next only when nothing else stands', () => {
    const row = setup('target_date_unset');
    expect(selectNext({ needs: [row], ownAct: null, canTake: always, closed: false })).toEqual({
      kind: 'need',
      row,
    });
  });

  it('skips a gated act', () => {
    const gated = need('payment_due', { sense: 'past', distance: -5 });
    const open = need('task_due', { sense: 'ahead', distance: 2 });
    const canTake = (choice: NextChoice<StandingRow>) =>
      !(choice.kind === 'need' && choice.row === gated);
    expect(selectNext({ needs: [gated, open], ownAct: own, canTake, closed: false })).toEqual({
      kind: 'need',
      row: open,
    });
    const ownGated = (choice: NextChoice<StandingRow>) => choice.kind !== 'own';
    expect(selectNext({ needs: [], ownAct: own, canTake: ownGated, closed: false })).toBeNull();
  });

  it('returns null on a closed job', () => {
    expect(
      selectNext({ needs: [need('payment_due')], ownAct: own, canTake: always, closed: true }),
    ).toBeNull();
  });
});
