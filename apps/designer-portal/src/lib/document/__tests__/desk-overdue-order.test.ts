/**
 * Ruling IV on the Desk — the overdue condition, and the ordering it was
 * supposed to produce.
 *
 * The ordering assertions here exist to pin a fact rather than a change: an
 * overdue folio ALREADY sorts above every other folio, because
 * `overdue_decision` is both the only urgent need and rank 0. A leading
 * overdue tier was added and then removed after these tests proved it inert.
 *
 * Ruling VI's folio need line is NOT implemented — see DECISIONS I117. The
 * Desk's read carries no gate to key to, and synthesising one from
 * `active_section` produced confident fiction over a count of overdue
 * decisions.
 */

import { partitionDesk, type DocumentStateRow } from '../desk-derivation';
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

describe('an overdue folio already sorts first, with no added tier', () => {
  it('rises above a non-gate need', () => {
    const { folders } = partitionDesk([dueTask, overdueDecision], NOW);
    expect(folders.map((folder) => folder.row.engagement_id)).toEqual([
      'merriweather',
      'linden',
    ]);
  });

  it('orders several overdue folios by their earliest due date', () => {
    const older = row({
      engagement_id: 'older',
      overdue_decision_count: 1,
      earliest_overdue_due: '2026-05-01T09:00:00.000Z',
      updated_at: '2026-05-11T12:00:00.000Z',
    });
    const { folders } = partitionDesk([overdueDecision, older], NOW);
    expect(folders.map((folder) => folder.row.engagement_id)).toEqual([
      'older',
      'merriweather',
    ]);
  });

  it('keeps a still-needed folio in place when its due date is missing', () => {
    // The removed overdue tier demoted this row below every non-gate folio,
    // because deriveOverdue answers NOT_OVERDUE without a due moment.
    const undated = row({
      engagement_id: 'undated',
      overdue_decision_count: 1,
      earliest_overdue_due: null,
    });
    const { folders } = partitionDesk([dueTask, undated], NOW);
    expect(folders[0].row.engagement_id).toBe('undated');
  });

  it('changes nothing else about the folio — no count, no second act', () => {
    const { folders } = partitionDesk([overdueDecision], NOW);
    const [folio] = folders;
    expect(folio.need.actionLabel).toBe('Review decisions');
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
    expect(partitionDesk(many, NOW).folders).toHaveLength(6);
  });
});

describe('the folio need line is NOT gate-keyed (recorded shortfall)', () => {
  it('prints the need’s own truthful line', () => {
    const { folders } = partitionDesk([overdueDecision], NOW);
    expect(folders[0].need.text).toBe('1 decision overdue — oldest due May 6');
  });
});
