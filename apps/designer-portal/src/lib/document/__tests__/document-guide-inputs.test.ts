import { composeDocumentGuideInputs } from '../document-guide-inputs';
import type { DocumentStateRow } from '../desk-derivation';

const row = (overrides: Partial<DocumentStateRow> = {}): DocumentStateRow => ({
  engagement_kind: 'relationship', engagement_id: 'relationship-1', project_id: null,
  proposal_id: null, lead_id: null, designer_id: 'designer-1', client_profile_id: 'client-1',
  client_name: 'Avery Stone', title: 'Stone Residence', active_section: 'discovery',
  project_status: null, current_phase: null, is_paused: false, is_archived: false,
  proposal_status: null, proposal_sent_at: null, proposal_viewed_at: null,
  proposal_updated_at: null, proposal_open_count: null, proposal_last_opened_at: null,
  lead_response_deadline: null, lead_status: null, overdue_decision_count: 0,
  earliest_overdue_due: null, awaiting_inspection_count: 0, blocked_item_count: 0,
  in_flight_count: 0, installed_count: 0, item_count: 0, updated_at: '2026-08-10',
  open_claim_count: 0, open_claim_po: null, unsent_pulse_count: 0, pulse_week_of: null,
  draft_unsent_po_count: 0, oldest_draft_po_created_at: null, draft_po_label: null,
  unacked_po_count: 0, oldest_unacked_sent_at: null, unacked_po_label: null,
  due_task_count: 0, earliest_task_due: null, due_task_title: null,
  ...overrides,
});

const idleReadiness = {
  discovery: { state: 'idle' as const },
  drafting: { state: 'idle' as const },
};

describe('composeDocumentGuideInputs', () => {
  it('composes real Discovery readiness into owner/blocker input facts', () => {
    const inputs = composeDocumentGuideInputs({
      row: row(),
      proposal: null,
      readiness: {
        ...idleReadiness,
        discovery: {
          state: 'ready',
          data: { project_type: 'full_home', rooms: [{ name: 'Living room' }] },
        },
      },
    });

    expect(inputs.map((input) => input.label)).toEqual([
      'Working budget', 'Target or hard date', 'Style direction', 'Lifestyle needs',
    ]);
    expect(inputs[0]).toEqual({ label: 'Working budget', owner: 'Client', blocks: 'Direction' });
  });

  it('composes the production drafting gaps used by Direction', () => {
    const inputs = composeDocumentGuideInputs({
      row: row({ engagement_kind: 'proposal', active_section: 'direction', proposal_id: 'proposal-1' }),
      proposal: { status: 'draft', documentKind: 'design_services', commercialState: 'draft', projectId: null },
      readiness: {
        ...idleReadiness,
        drafting: { state: 'ready', data: { gaps: ['phases & fees', 'change-order terms'] } },
      },
    });

    expect(inputs).toEqual([
      { label: 'phases & fees', owner: 'Designer', blocks: 'Client proposal' },
      { label: 'change-order terms', owner: 'Designer', blocks: 'Client proposal' },
    ]);
  });

  it('uses live proposal transitions and row-backed blockers only', () => {
    expect(composeDocumentGuideInputs({
      row: row({ engagement_kind: 'proposal', active_section: 'proposal', proposal_id: 'proposal-1' }),
      proposal: { status: 'sent', documentKind: 'design_services', commercialState: 'client_signed', projectId: null },
      readiness: idleReadiness,
    })).toEqual([
      { label: 'Studio countersignature', owner: 'Studio', blocks: 'Project activation' },
    ]);

    expect(composeDocumentGuideInputs({
      row: row({ engagement_kind: 'project', active_section: 'project', project_id: 'project-1', blocked_item_count: 2 }),
      proposal: null,
      readiness: idleReadiness,
    })[0]).toEqual({ label: '2 blocked project items', owner: 'Project team', blocks: 'Active project work' });
  });

  it('does not turn loading or error reads into missing-input claims', () => {
    expect(composeDocumentGuideInputs({
      row: row(), proposal: null,
      readiness: { discovery: { state: 'loading' }, drafting: { state: 'error' } },
    })).toEqual([]);
  });
});

