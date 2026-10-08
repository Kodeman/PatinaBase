import { ACT_TIER, NEED_ACT_LABELS } from '../act-names';
import { NEED_ACTION_LABELS, type NeedKind } from '../desk-derivation';
import { OPEN_THE_JOB } from '../desk-roster-derivation';

describe('Desk need action labels', () => {
  it('defines the explicit visible action for every NeedKind', () => {
    const expected = {
      overdue_decision: 'Review decisions',
      overdue_invoice: 'Send reminder',
      proposal_signed: 'Open the project',
      claim_window: 'Notify the vendor',
      damage_claim: 'Review the claim',
      proposal_declined: 'Follow up',
      proposal_expired: 'Revise proposal',
      lines_flagged: 'Review flagged lines',
      new_lead: null,
      ceremony_pending: 'Continue the introduction',
      reconnect_due: null,
      hesitating_proposal: 'Follow up',
      awaiting_inspection: 'Inspect the delivery',
      schedule_conflict: 'Resolve the schedule',
      schedule_proposal: 'Review the proposed date',
      task_due: 'Open the task',
      schedule_unconfigured: 'Open the schedule',
      po_unsent: 'Review the purchase order',
      po_unacknowledged: 'Follow up with the maker',
      pulse_due: 'Review and send',
      payment_due: 'Record payment',
      payment_failed: 'Pay again',
      ack_discrepancy: 'Answer the vendor',
      quote_expiring: 'Reconfirm the price',
      cfa_pending: 'Approve the CFA',
      memo_return: 'Mark returned',
      return_by: 'Return it or keep it',
      exception_open: 'Choose a path',
    } satisfies Record<NeedKind, string | null>;

    expect(NEED_ACTION_LABELS).toEqual(expected);
    expect(NEED_ACTION_LABELS.new_lead).toBeNull();
    expect(NEED_ACTION_LABELS.reconnect_due).toBeNull();
  });

  // US-19 FR4 Fix 5 — the acts the one-voice Desk card borrows from the paper
  // are strings act-names.ts already owns; the Desk adds no vocabulary.
  it('borrows the paper’s own acts under one-voice, adding no vocabulary', () => {
    expect(OPEN_THE_JOB).toBe('Open the job');
    expect(ACT_TIER['Respond to the inquiry']).toBe('scored');
    expect(NEED_ACT_LABELS.new_lead).toBe('Respond to the inquiry');
    expect(ACT_TIER['Nudge {first name}']).toBe('scored');
  });
});
