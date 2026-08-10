import { deriveDocumentGuide } from '../document-guide';
import type { DocumentStateRow, SectionKey } from '../desk-derivation';

const row = (activeSection: SectionKey, overrides: Partial<DocumentStateRow> = {}) =>
  ({
    engagement_kind: activeSection === 'brief' ? 'lead' : activeSection === 'discovery' ? 'relationship' : activeSection === 'direction' || activeSection === 'proposal' ? 'proposal' : 'project',
    engagement_id: 'engagement-1',
    project_id: activeSection === 'project' || activeSection === 'install' || activeSection === 'care' ? 'project-1' : null,
    proposal_id: activeSection === 'direction' || activeSection === 'proposal' ? 'proposal-1' : null,
    lead_id: activeSection === 'brief' ? 'lead-1' : null,
    designer_id: 'designer-1',
    client_profile_id: 'client-1',
    client_name: 'Avery Stone',
    title: 'Stone Residence',
    active_section: activeSection,
    project_status: 'active',
    current_phase: activeSection === 'install' ? 'installation' : 'design_development',
    is_paused: false,
    is_archived: false,
    proposal_status: activeSection === 'direction' ? 'draft' : activeSection === 'proposal' ? 'sent' : null,
    proposal_sent_at: activeSection === 'proposal' ? '2026-08-09T12:00:00Z' : null,
    proposal_viewed_at: null,
    lead_response_deadline: null,
    lead_status: null,
    overdue_decision_count: 0,
    earliest_overdue_due: null,
    awaiting_inspection_count: 0,
    blocked_item_count: 0,
    in_flight_count: 0,
    installed_count: 0,
    item_count: 0,
    updated_at: '2026-08-10T12:00:00Z',
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

describe('deriveDocumentGuide', () => {
  it.each([
    ['brief', 'Review the inquiry', 'brief'],
    ['discovery', 'Complete Discovery', 'discovery'],
    ['direction', 'Shape the direction', '/drafting/proposal-1'],
    ['proposal', 'Follow up on the proposal', 'proposal'],
    ['project', 'Move the project forward', 'project'],
    ['install', 'Complete the installation', 'install'],
    ['care', 'Close out the project', 'care'],
  ] as const)('gives %s a useful lifecycle action', (section, headline, destination) => {
    const guide = deriveDocumentGuide({ row: row(section), now: new Date('2026-08-10T12:00:00Z') });

    expect(guide.headline).toBe(headline);
    expect(guide.action).not.toBeNull();
    expect(
      guide.action?.destination.kind === 'href'
        ? guide.action.destination.href
        : guide.action?.destination.kind === 'anchor'
          ? guide.action.destination.section
          : null,
    ).toBe(destination);
  });

  it('puts unavailable and paused states ahead of every other need', () => {
    expect(deriveDocumentGuide({ row: row('project'), availability: 'unavailable' }).state).toBe('unavailable');
    const paused = deriveDocumentGuide({
      row: row('project', { is_paused: true, overdue_decision_count: 3 }),
    });
    expect(paused.state).toBe('paused');
    expect(paused.headline).toBe('This project is paused');
  });

  it('puts an operational need ahead of stage guidance', () => {
    const guide = deriveDocumentGuide({
      row: row('project', { overdue_decision_count: 2, earliest_overdue_due: '2026-08-01' }),
      now: new Date('2026-08-10T12:00:00Z'),
    });
    expect(guide.state).toBe('actionable');
    expect(guide.headline).toContain('2 decisions overdue');
    expect(guide.action?.label).toBe('Review decisions');
  });

  it('shows the highest hard input and an honest remaining count', () => {
    const guide = deriveDocumentGuide({
      row: row('discovery'),
      hardInputs: [
        { label: 'Project scope', owner: 'Designer', blocks: 'Direction' },
        { label: 'Working budget', owner: 'Client', blocks: 'Direction' },
        { label: 'Target date', owner: 'Client', blocks: 'Direction' },
      ],
    });
    expect(guide.topInput).toEqual({ label: 'Project scope', owner: 'Designer', blocks: 'Direction' });
    expect(guide.remainingInputCount).toBe(2);
  });
});
