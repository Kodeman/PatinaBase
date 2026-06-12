/**
 * R23 — dued tasks on the Desk: a dued task passes the R22 action test (the
 * act: do it) and rises as a quiet folder; undated tasks never nag.
 */

import { deriveNeed, type DocumentStateRow } from '../desk-derivation';

const NOW = new Date('2026-06-12T16:00:00Z');

function projectRow(over: Partial<DocumentStateRow> = {}): DocumentStateRow {
  return {
    engagement_kind: 'project',
    engagement_id: 'p1',
    project_id: 'p1',
    proposal_id: null,
    lead_id: null,
    designer_id: 'd1',
    client_profile_id: 'c1',
    client_name: 'Sarah Whitfield',
    title: 'Whitfield Residence',
    project_status: 'active',
    current_phase: 'procurement',
    active_section: 'project',
    is_paused: false,
    is_archived: false,
    proposal_status: null,
    proposal_sent_at: null,
    proposal_viewed_at: null,
    lead_response_deadline: null,
    lead_status: null,
    overdue_decision_count: 0,
    earliest_overdue_due: null,
    awaiting_inspection_count: 0,
    blocked_item_count: 0,
    in_flight_count: 0,
    installed_count: 0,
    item_count: 4,
    updated_at: '2026-06-10T00:00:00Z',
    open_claim_count: 0,
    open_claim_po: null,
    unsent_pulse_count: 0,
    pulse_week_of: null,
    draft_unsent_po_count: 0,
    oldest_draft_po_created_at: null,
    draft_po_label: null,
    unacked_po_count: 0,
    oldest_unacked_sent_at: null,
    unacked_po_label: null,
    due_task_count: 0,
    earliest_task_due: null,
    due_task_title: null,
    ...over,
  };
}

describe('task_due need (R23/R22)', () => {
  it('one dued task names itself', () => {
    const need = deriveNeed(
      projectRow({ due_task_count: 1, earliest_task_due: '2026-06-12', due_task_title: 'Order fabric memos' }),
      NOW,
    );
    expect(need?.kind).toBe('task_due');
    expect(need?.text).toBe('Task due — Order fabric memos');
    expect(need?.stamp.label).toBe('TASK DUE');
    expect(need?.urgent).toBe(false);
  });

  it('several dued tasks count and date themselves', () => {
    const need = deriveNeed(
      projectRow({ due_task_count: 3, earliest_task_due: '2026-06-10', due_task_title: 'Order fabric memos' }),
      NOW,
    );
    expect(need?.kind).toBe('task_due');
    expect(need?.text).toMatch(/^3 tasks due — oldest Jun/);
  });

  it('no dued tasks → no nag (undated tasks never surface)', () => {
    expect(deriveNeed(projectRow(), NOW)).toBeNull();
  });

  it('an overdue decision outranks a dued task (the one thing)', () => {
    const need = deriveNeed(
      projectRow({
        due_task_count: 1,
        earliest_task_due: '2026-06-12',
        due_task_title: 'Order fabric memos',
        overdue_decision_count: 1,
        earliest_overdue_due: '2026-06-10T00:00:00Z',
      }),
      NOW,
    );
    expect(need?.kind).toBe('overdue_decision');
  });

  it('a delivered piece awaiting inspection outranks a dued task', () => {
    const need = deriveNeed(
      projectRow({
        due_task_count: 1,
        earliest_task_due: '2026-06-12',
        due_task_title: 'Order fabric memos',
        awaiting_inspection_count: 1,
      }),
      NOW,
    );
    expect(need?.kind).toBe('awaiting_inspection');
  });

  it('a dued task outranks the send-weave nudges', () => {
    const need = deriveNeed(
      projectRow({
        due_task_count: 1,
        earliest_task_due: '2026-06-12',
        due_task_title: 'Order fabric memos',
        draft_unsent_po_count: 1,
        oldest_draft_po_created_at: '2026-06-09T00:00:00Z',
        draft_po_label: 'PO-00012',
      }),
      NOW,
    );
    expect(need?.kind).toBe('task_due');
  });

  it('paused and archived stay silent', () => {
    expect(
      deriveNeed(projectRow({ is_paused: true, due_task_count: 2, earliest_task_due: '2026-06-12' }), NOW),
    ).toBeNull();
    expect(
      deriveNeed(projectRow({ is_archived: true, due_task_count: 2, earliest_task_due: '2026-06-12' }), NOW),
    ).toBeNull();
  });
});
