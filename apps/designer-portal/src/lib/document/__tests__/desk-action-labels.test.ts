import { NEED_ACTION_LABELS, type NeedKind } from '../desk-derivation';

describe('Desk need action labels', () => {
  it('defines the explicit visible action for every NeedKind', () => {
    const expected = {
      overdue_decision: 'Review decisions',
      overdue_invoice: 'Send reminder',
      proposal_signed: 'Open the project',
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
      task_due: 'Open the task',
      po_unsent: 'Review the purchase order',
      po_unacknowledged: 'Follow up with the maker',
      pulse_due: 'Review and send',
    } satisfies Record<NeedKind, string | null>;

    expect(NEED_ACTION_LABELS).toEqual(expected);
    expect(NEED_ACTION_LABELS.new_lead).toBeNull();
    expect(NEED_ACTION_LABELS.reconnect_due).toBeNull();
  });
});
