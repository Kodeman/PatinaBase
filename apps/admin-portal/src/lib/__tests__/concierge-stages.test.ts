import {
  advanceGate,
  CONCIERGE_STAGES,
  daysUntilDeadline,
  formatAgeInStage,
  formatCountdown,
  isConciergeStage,
  isDeadlineUrgent,
  isStageChecklistComplete,
  isTerminalStage,
  nextStage,
  nextUndoneRequiredItem,
  paymentFlagVariant,
  requiredRemaining,
  type ChecklistItem,
  type Checklists,
} from '@/lib/concierge-stages';

const NOW = new Date('2026-07-12T12:00:00Z');

function item(over: Partial<ChecklistItem> & Pick<ChecklistItem, 'key'>): ChecklistItem {
  return { label: over.key, required: true, done: false, done_at: null, by: null, ...over };
}

describe('stage ordering', () => {
  it('nextStage walks forward and stops at reconciled', () => {
    expect(nextStage('po_draft')).toBe('po_sent');
    expect(nextStage('delivered')).toBe('reconciled');
    expect(nextStage('reconciled')).toBeNull();
    expect(nextStage('cancelled')).toBeNull();
  });

  it('isTerminalStage flags reconciled + cancelled only', () => {
    expect(isTerminalStage('reconciled')).toBe(true);
    expect(isTerminalStage('cancelled')).toBe(true);
    expect(isTerminalStage('delivered')).toBe(false);
  });

  it('isConciergeStage accepts real stages incl. cancelled, rejects junk', () => {
    for (const s of CONCIERGE_STAGES) expect(isConciergeStage(s)).toBe(true);
    expect(isConciergeStage('cancelled')).toBe(true);
    expect(isConciergeStage('shipped')).toBe(false);
  });
});

describe('checklist predicates', () => {
  const mixed: ChecklistItem[] = [
    item({ key: 'a', required: true, done: true }),
    item({ key: 'b', required: false, done: false }), // optional, undone — must NOT block
    item({ key: 'c', required: true, done: false }), // required, undone — blocks
    item({ key: 'd', required: true, done: false }),
  ];

  it('nextUndoneRequiredItem skips done + optional, returns the first blocking required item', () => {
    expect(nextUndoneRequiredItem(mixed)?.key).toBe('c');
    expect(nextUndoneRequiredItem(undefined)).toBeNull();
    expect(nextUndoneRequiredItem([])).toBeNull();
  });

  it('requiredRemaining counts only required + undone', () => {
    expect(requiredRemaining(mixed)).toBe(2);
    expect(requiredRemaining(undefined)).toBe(0);
  });

  it('isStageChecklistComplete is true only when no required item is undone', () => {
    expect(isStageChecklistComplete(mixed)).toBe(false);
    expect(
      isStageChecklistComplete([
        item({ key: 'a', required: true, done: true }),
        item({ key: 'b', required: false, done: false }),
      ]),
    ).toBe(true);
  });
});

describe('advanceGate (mirrors advance_concierge_order)', () => {
  it('blocks with the first required-undone item and reports the next stage', () => {
    const checklists: Checklists = {
      po_draft: [item({ key: 'confirm_maker', required: true, done: false })],
    };
    const gate = advanceGate('po_draft', checklists);
    expect(gate.allowed).toBe(false);
    expect(gate.blocking?.key).toBe('confirm_maker');
    expect(gate.to).toBe('po_sent');
  });

  it('allows once the current stage is complete', () => {
    const checklists: Checklists = {
      freight_booked: [item({ key: 'book', required: true, done: true })],
    };
    const gate = advanceGate('freight_booked', checklists);
    expect(gate.allowed).toBe(true);
    expect(gate.blocking).toBeNull();
    expect(gate.to).toBe('in_transit');
  });

  it('an empty/absent checklist means nothing blocks', () => {
    expect(advanceGate('in_transit', {}).allowed).toBe(true);
  });

  it('terminal stages never advance', () => {
    expect(advanceGate('reconciled', {})).toEqual({ allowed: false, blocking: null, to: null });
    expect(advanceGate('cancelled', {})).toEqual({ allowed: false, blocking: null, to: null });
  });
});

describe('age-in-stage', () => {
  it('formats <1h / hours / days and handles missing input', () => {
    expect(formatAgeInStage(null, NOW)).toBe('—');
    expect(formatAgeInStage('not-a-date', NOW)).toBe('—');
    expect(formatAgeInStage(new Date(NOW.getTime() - 30 * 60 * 1000).toISOString(), NOW)).toBe('<1h');
    expect(formatAgeInStage(new Date(NOW.getTime() - 6 * 60 * 60 * 1000).toISOString(), NOW)).toBe('6h');
    expect(formatAgeInStage(new Date(NOW.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(), NOW)).toBe('3d');
  });
});

describe('damage countdown edges', () => {
  it('daysUntilDeadline is date-only whole days, negative when past', () => {
    expect(daysUntilDeadline('2026-07-12', NOW)).toBe(0); // today
    expect(daysUntilDeadline('2026-07-15', NOW)).toBe(3);
    expect(daysUntilDeadline('2026-07-10', NOW)).toBe(-2);
    expect(daysUntilDeadline(null, NOW)).toBeNull();
    expect(daysUntilDeadline('garbage', NOW)).toBeNull();
  });

  it('formatCountdown covers overdue / due today / N left / none', () => {
    expect(formatCountdown('2026-07-10', NOW)).toBe('overdue');
    expect(formatCountdown('2026-07-12', NOW)).toBe('due today');
    expect(formatCountdown('2026-07-13', NOW)).toBe('1d left');
    expect(formatCountdown('2026-07-19', NOW)).toBe('7d left');
    expect(formatCountdown(null, NOW)).toBe('—');
  });

  it('isDeadlineUrgent fires at/under 7 days and when past due, not beyond', () => {
    expect(isDeadlineUrgent('2026-07-19', NOW)).toBe(true); // exactly 7d
    expect(isDeadlineUrgent('2026-07-20', NOW)).toBe(false); // 8d
    expect(isDeadlineUrgent('2026-07-12', NOW)).toBe(true); // today
    expect(isDeadlineUrgent('2026-07-01', NOW)).toBe(true); // overdue
    expect(isDeadlineUrgent(null, NOW)).toBe(false);
  });
});

describe('paymentFlagVariant', () => {
  it('maps mismatch -> error, ok -> success, unchecked -> neutral', () => {
    expect(paymentFlagVariant('mismatch')).toBe('error');
    expect(paymentFlagVariant('ok')).toBe('success');
    expect(paymentFlagVariant('unchecked')).toBe('neutral');
  });
});
