/**
 * Rulings IV and VI on the Desk — an overdue folio rises, and its need line
 * keys to the gate. The 2–4 folio ceiling is untouched by either.
 */

import { partitionDesk, type DocumentStateRow } from '../desk-derivation';
import { deskGateSentence } from '../workflow-gate';
import { NOT_OVERDUE } from '../overdue-condition';

const NOW = new Date('2026-05-12T09:00:00.000Z');

const row = (overrides: Partial<DocumentStateRow>): DocumentStateRow =>
  ({
    engagement_kind: 'project',
    engagement_id: 'engagement-1',
    project_id: 'project-1',
    proposal_id: null,
    lead_id: null,
    designer_id: 'designer-1',
    client_profile_id: 'client-1',
    client_name: 'Marta',
    title: 'The Merriweather House',
    project_status: 'active',
    current_phase: 'design_development',
    active_section: 'direction',
    is_paused: false,
    is_archived: false,
    proposal_status: null,
    proposal_sent_at: null,
    proposal_viewed_at: null,
    proposal_updated_at: null,
    proposal_open_count: null,
    proposal_last_opened_at: null,
    lead_response_deadline: null,
    lead_status: null,
    overdue_decision_count: 0,
    earliest_overdue_due: null,
    awaiting_inspection_count: 0,
    blocked_item_count: 0,
    in_flight_count: 0,
    installed_count: 0,
    item_count: 0,
    updated_at: '2026-05-10T12:00:00.000Z',
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
    ...overrides,
  }) as DocumentStateRow;

const overdueDecision = row({
  engagement_id: 'merriweather',
  overdue_decision_count: 1,
  earliest_overdue_due: '2026-05-06T09:00:00.000Z',
});

const dueTask = row({
  engagement_id: 'linden',
  title: 'Linden Row',
  due_task_count: 1,
  earliest_task_due: '2026-05-11T09:00:00.000Z',
  due_task_title: 'Confirm the credenza finish',
});

describe('the overdue condition rides the folder', () => {
  it('carries the same derivation the stamp and the sentence read', () => {
    const { folders } = partitionDesk([overdueDecision], NOW);
    expect(folders[0].overdue).toEqual({ isOverdue: true, days: 6 });
  });

  it('leaves a folio whose need is not a gate with no condition', () => {
    const { folders } = partitionDesk([dueTask], NOW);
    expect(folders[0].overdue).toEqual(NOT_OVERDUE);
  });
});

describe('the Desk re-sorts upward', () => {
  it('rises the overdue folio to first position', () => {
    const { folders } = partitionDesk([dueTask, overdueDecision], NOW);
    expect(folders.map((folder) => folder.row.engagement_id)).toEqual([
      'merriweather',
      'linden',
    ]);
  });

  it('changes nothing else about the folio — no count, no second act', () => {
    const { folders } = partitionDesk([overdueDecision], NOW);
    const [folio] = folders;
    expect(folio.need.actionLabel).toBe('Review decisions');
    expect(Object.keys(folio.need)).not.toContain('badge');
    expect(folio.need.stamp.label).toBe('DECISION DUE');
  });

  it('holds the folio ceiling untouched', () => {
    const many = Array.from({ length: 6 }, (_, index) =>
      row({
        engagement_id: `project-${index}`,
        overdue_decision_count: 1,
        earliest_overdue_due: '2026-05-06T09:00:00.000Z',
      }),
    );
    // partitionDesk never truncates folders; the 2–4 ceiling is a preview
    // decision made by the Desk's own renderer and is not moved here.
    expect(partitionDesk(many, NOW).folders).toHaveLength(6);
  });
});

describe('the folio need line keys to the gate', () => {
  it('names the party, the artifact, and the elapsed time', () => {
    const { folders } = partitionDesk([overdueDecision], NOW);
    expect(
      deskGateSentence({
        clientName: folders[0].row.client_name,
        activeSection: folders[0].row.active_section,
        overdue: folders[0].overdue ?? NOT_OVERDUE,
      }),
    ).toBe("Marta's Direction approval has waited 6 days.");
  });

  it('leaves a non-gate need its own line', () => {
    const { folders } = partitionDesk([dueTask], NOW);
    expect(
      deskGateSentence({
        clientName: folders[0].row.client_name,
        activeSection: folders[0].row.active_section,
        overdue: folders[0].overdue ?? NOT_OVERDUE,
      }),
    ).toBeNull();
    expect(folders[0].need.text).toContain('Confirm the credenza finish');
  });
});
