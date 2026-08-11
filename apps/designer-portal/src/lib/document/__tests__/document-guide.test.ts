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
    ['proposal', 'Wait for the client’s signature', 'proposal'],
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

  it('keeps row-only guidance quiet while enriched signals load', () => {
    const guide = deriveDocumentGuide({ row: row('brief'), availability: 'loading' });
    expect(guide).toMatchObject({
      state: 'loading', headline: 'Checking what needs attention', action: null,
    });
  });

  it('offers an explicit retry only when the failed source is retryable here', () => {
    const guide = deriveDocumentGuide({
      row: row('brief'), availability: 'unavailable', retryAvailable: true,
    });
    expect(guide.action).toMatchObject({ key: 'retry-guidance', label: 'Try again' });
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

  it('accepts the enriched need selected from the shared Desk composition', () => {
    const guide = deriveDocumentGuide({
      row: row('project'),
      operationalNeed: {
        kind: 'schedule_conflict',
        text: 'Install collision needs resolution',
        actionLabel: 'Resolve the schedule',
        stamp: { label: 'COLLISION', color: 'var(--color-terracotta)' },
        urgent: false,
      },
    });
    expect(guide.headline).toBe('Install collision needs resolution');
  });

  it.each([
    ['draft', 'legacy', null, 'Finish the proposal', 'Open Drafting Room'],
    ['sent', 'legacy', null, 'Wait for the client’s signature', 'Review signing controls'],
    ['accepted', 'legacy', null, 'The client has signed', 'Review signing controls'],
    ['declined', 'legacy', null, 'Follow up on the proposal', 'Review follow-up controls'],
    ['expired', 'legacy', null, 'Follow up on the expired proposal', 'Review follow-up controls'],
    ['ignored', 'design_services', 'client_signed', 'Countersign the design agreement', 'Review countersign controls'],
    ['ignored', 'design_services', 'executed', 'Open the authorized project', 'Open the project'],
  ] as const)('uses live proposal facts for %s/%s/%s', (status, documentKind, commercialState, headline, label) => {
    const guide = deriveDocumentGuide({
      row: row('proposal'),
      proposal: { status, documentKind, commercialState, projectId: commercialState === 'executed' ? 'project-1' : null },
    });
    expect(guide.headline).toBe(headline);
    expect(guide.action?.label).toBe(label);
  });

  it('routes order-backed needs to the existing Orders ledger context', () => {
    const guide = deriveDocumentGuide({
      row: row('project', { awaiting_inspection_count: 2 }),
    });

    expect(guide.action?.destination).toEqual({
      kind: 'ledger',
      name: 'orders',
      context: { page: 'receiving', projectId: 'project-1' },
    });
    expect(guide.reason).not.toContain('highest-priority');
  });

  it.each([
    ['sent', 'Wait for the client’s signature'],
    ['client_signed', 'Countersign the design agreement'],
    ['declined', 'Follow up on the proposal'],
    ['superseded', 'Follow up on the proposal'],
  ] as const)('lets live commercial %s override stale accepted legacy state', (commercialState, headline) => {
    const guide = deriveDocumentGuide({
      row: row('proposal', {
        proposal_status: 'accepted',
        proposal_sent_at: '2026-07-01T12:00:00Z',
        proposal_viewed_at: '2026-07-02T12:00:00Z',
      }),
      now: new Date('2026-08-10T12:00:00Z'),
      proposal: {
        status: 'accepted',
        documentKind: 'design_services',
        commercialState,
        projectId: null,
      },
    });

    expect(guide.headline).toBe(headline);
  });

  it.each(['sent', 'viewed'] as const)('does not let an aged legacy %s signal override client-signed commercial truth', (legacyStatus) => {
    const guide = deriveDocumentGuide({
      row: row('proposal', {
        proposal_status: legacyStatus,
        proposal_sent_at: '2026-07-01T12:00:00Z',
        proposal_viewed_at: legacyStatus === 'viewed' ? '2026-07-02T12:00:00Z' : null,
      }),
      now: new Date('2026-08-10T12:00:00Z'),
      proposal: {
        status: legacyStatus,
        documentKind: 'design_services',
        commercialState: 'client_signed',
        projectId: null,
      },
    });
    expect(guide.headline).toBe('Countersign the design agreement');
  });

  it.each(['sent', 'viewed'] as const)('preserves aged %s follow-up when commercial truth is still sent', (legacyStatus) => {
    const guide = deriveDocumentGuide({
      row: row('proposal', {
        proposal_status: legacyStatus,
        proposal_sent_at: '2026-07-01T12:00:00Z',
        proposal_viewed_at: legacyStatus === 'viewed' ? '2026-07-02T12:00:00Z' : null,
      }),
      now: new Date('2026-08-10T12:00:00Z'),
      proposal: {
        status: legacyStatus,
        documentKind: 'design_services',
        commercialState: 'sent',
        projectId: null,
      },
    });
    expect(guide.headline).toMatch(legacyStatus === 'sent' ? /not yet opened/ : /no signature yet/);
    expect(guide.action?.label).toBe('Follow up');
  });

  it('treats a revised legacy proposal as superseded follow-up', () => {
    const guide = deriveDocumentGuide({
      row: row('proposal'),
      proposal: { status: 'revised', documentKind: 'legacy', commercialState: null, projectId: null },
    });
    expect(guide.eyebrow).toContain('superseded');
    expect(guide.action?.label).toBe('Review follow-up controls');
  });

  it('carries truthful input owner, blocker, and remaining count', () => {
    const guide = deriveDocumentGuide({
      row: row('discovery'),
      inputFacts: [
        { label: 'Working budget', owner: 'Client', blocks: 'Direction' },
        { label: 'Style direction', owner: 'Client', blocks: 'Direction' },
      ],
    });
    expect(guide.topInput).toEqual({ label: 'Working budget', owner: 'Client', blocks: 'Direction' });
    expect(guide.remainingInputCount).toBe(1);
  });

  it('keeps a draft commercial agreement reachable from Direction', () => {
    const guide = deriveDocumentGuide({
      row: row('direction'),
      proposal: { status: 'draft', documentKind: 'design_services', commercialState: 'draft', projectId: null },
      inputFacts: [{ label: 'phases & fees', owner: 'Designer', blocks: 'Client proposal' }],
    });
    expect(guide.action).toEqual({
      key: 'open-drafting-room',
      label: 'Open Drafting Room',
      destination: { kind: 'href', href: '/drafting/proposal-1' },
    });
    expect(guide.topInput?.label).toBe('phases & fees');
  });

  it('routes reconnect work to the canonical People nurture view', () => {
    const guide = deriveDocumentGuide({
      row: row('brief', {
        lead_status: 'contacted',
        lead_response_deadline: '2026-08-01T12:00:00Z',
      }),
      now: new Date('2026-08-10T12:00:00Z'),
    });
    expect(guide.action?.destination).toEqual({ kind: 'href', href: '/people?view=nurture' });
  });

  it.each([
    [{ overdue_decision_count: 1 }, 'document-decision-controls', false],
    [{ due_task_count: 1, earliest_task_due: '2026-08-10', due_task_title: 'Confirm trim' }, 'document-task-controls', false],
    [{ unsent_pulse_count: 1, pulse_week_of: '2026-08-03' }, 'document-pulse-control', true],
  ] as const)('routes row-backed work to its mounted canonical target', (overrides, focusId, activate) => {
    const guide = deriveDocumentGuide({
      row: row('project', overrides),
      now: new Date('2026-08-10T12:00:00Z'),
    });
    expect(guide.action?.destination).toMatchObject({
      kind: 'anchor', section: 'project', focusId, activate,
    });
  });

  it('routes paused work to the project status target', () => {
    const guide = deriveDocumentGuide({ row: row('project', { is_paused: true }) });
    expect(guide.action?.destination).toEqual({
      kind: 'anchor', section: 'project', focusId: 'document-project-status',
    });
  });

  it('keeps a paused Discovery document on its own resume act', () => {
    const guide = deriveDocumentGuide({
      row: row('discovery', { is_paused: true }),
      inputFacts: [
        { label: 'Working budget', owner: 'Client', blocks: 'Direction', focusId: 'discovery-facet-budget' },
      ],
    });

    expect(guide.state).toBe('paused');
    expect(guide.action).toEqual({
      key: 'review-paused-project',
      label: 'Review project status',
      destination: { kind: 'anchor', section: 'discovery', focusId: 'document-project-status' },
    });
    expect(guide.topInput?.label).toBe('Working budget');
  });

  it('keeps an operational need on its own act when inputs are still missing', () => {
    const guide = deriveDocumentGuide({
      row: row('discovery', { overdue_decision_count: 1, earliest_overdue_due: '2026-08-01' }),
      now: new Date('2026-08-10T12:00:00Z'),
      inputFacts: [
        { label: 'Working budget', owner: 'Client', blocks: 'Direction', focusId: 'discovery-facet-budget' },
      ],
    });

    expect(guide.state).toBe('actionable');
    expect(guide.action).toEqual({
      key: 'resolve-overdue_decision',
      label: 'Review decisions',
      destination: {
        kind: 'anchor', section: 'discovery', focusId: 'document-decision-controls', activate: false,
      },
    });
    expect(guide.topInput?.label).toBe('Working budget');
  });

  it('still derives the input act on the needs-input branch', () => {
    const guide = deriveDocumentGuide({
      row: row('discovery'),
      inputFacts: [
        { label: 'Working budget', owner: 'Client', blocks: 'Direction', focusId: 'discovery-facet-budget' },
      ],
    });

    expect(guide.state).toBe('needs_input');
    expect(guide.action).toEqual({
      key: 'open-missing-input',
      label: 'Add Working budget',
      destination: {
        kind: 'anchor', section: 'discovery', focusId: 'discovery-facet-budget', activate: true,
      },
    });
  });
});
