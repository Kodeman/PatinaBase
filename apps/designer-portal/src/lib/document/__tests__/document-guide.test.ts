import { deriveDocumentGuide, needGuideAction } from '../document-guide';
import type { DocumentStateRow, NeedKind, SectionKey } from '../desk-derivation';
import { deriveGate } from '../workflow-gate';
import type { ProjectContextualHandoff } from '@patina/supabase';

const SECTIONS: readonly SectionKey[] = [
  'brief', 'discovery', 'direction', 'proposal', 'project', 'install', 'care',
];

const NEED_KINDS: readonly NeedKind[] = [
  'overdue_decision', 'overdue_invoice', 'proposal_signed', 'damage_claim',
  'proposal_declined', 'proposal_expired', 'lines_flagged', 'new_lead',
  'ceremony_pending', 'reconnect_due', 'hesitating_proposal',
  'awaiting_inspection', 'schedule_conflict', 'schedule_proposal', 'task_due',
  'schedule_unconfigured', 'po_unsent', 'po_unacknowledged', 'pulse_due',
];

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
  // F18 — the seven sentences, each a verb and an object (direction A §3).
  it.each([
    ['brief', 'Decide on this inquiry', 'Accept and begin', 'brief'],
    ['discovery', 'Finish what you need to know', 'Add scope & rooms', 'discovery'],
    ['direction', 'Draw up the direction', 'Open the Drafting Room', '/drafting/proposal-1'],
    ['proposal', 'Wait for the client’s signature', 'Review signing controls', 'proposal'],
    ['project', 'The work is in motion — nothing is waiting on you', 'Open the FF&E schedule', 'project'],
    ['install', 'Complete the installation', "Check what's arriving", 'install'],
    ['care', 'Close the book on this one', 'Run the closeout checklist', 'care'],
  ] as const)('gives %s a useful lifecycle action', (section, headline, label, destination) => {
    const guide = deriveDocumentGuide({ row: row(section), now: new Date('2026-08-10T12:00:00Z') });

    expect(guide.headline).toBe(headline);
    expect(guide.action?.label).toBe(label);
    expect(
      guide.action?.destination.kind === 'href'
        ? guide.action.destination.href
        : guide.action?.destination.kind === 'anchor'
          ? guide.action.destination.section
          : null,
    ).toBe(destination);
  });

  it('never leads a stage act with the word Review, except the proposal signing controls SP-12 preserves', () => {
    const labels = SECTIONS.map(
      (section) =>
        deriveDocumentGuide({ row: row(section), now: new Date('2026-08-10T12:00:00Z') }).action?.label ?? '',
    );

    expect(labels.filter((label) => /\bReview\b/.test(label))).toEqual(['Review signing controls']);
  });

  // The needs-attention branch outranks the stage default, so the Review sweep
  // has to cover every kind it can print, not only the seven stages.
  it.each(NEED_KINDS)('never leads the %s act with the word Review', (kind) => {
    const guide = deriveDocumentGuide({
      row: row('project'),
      operationalNeed: {
        kind,
        text: 'Something is waiting',
        // The folio's own copy leads six kinds with `Review`; the document
        // states the kind's verb instead, so this must not reach the strip.
        actionLabel: 'Review the thing',
        stamp: { label: 'X', color: 'var(--color-clay)' },
        urgent: false,
      },
    });

    expect(guide.action?.label).not.toMatch(/\bReview\b/);
  });

  it('retires Review now as the needs-attention default, naming the kind\'s own verb', () => {
    const guide = deriveDocumentGuide({
      row: row('brief'),
      operationalNeed: {
        kind: 'new_lead',
        text: 'New lead — respond',
        // The one shape that reached the old `Review now`: a need whose card
        // owns a TriageBar instead of a footer act.
        actionLabel: null,
        stamp: { label: 'NEW LEAD', color: 'var(--color-clay)' },
        urgent: false,
      },
    });

    expect(guide.action?.label).toBe('Respond to the inquiry');
    expect(guide.action?.label).not.toMatch(/\bReview\b/);
  });

  it('lands each stage act on a body that spread actually prints', () => {
    const now = new Date('2026-08-10T12:00:00Z');
    const project = deriveDocumentGuide({ row: row('project'), now });
    const install = deriveDocumentGuide({ row: row('install'), now });
    const care = deriveDocumentGuide({ row: row('care'), now });

    // The FF&E region head — project mode's RegionHead carries this id.
    expect(project.action?.destination).toEqual({
      kind: 'anchor', section: 'project', focusId: 'ffe-region-heading-project-1',
    });
    // The movement column — only the install and care spreads print it, which
    // is why install may not borrow the project head's id.
    expect(install.action?.destination).toEqual({
      kind: 'anchor', section: 'install', focusId: 'ffe-movement-project-1',
    });
    expect(care.action?.destination).toEqual({
      kind: 'anchor', section: 'care', focusId: 'closing-the-book',
    });
  });

  // ⌥ the two templated headlines (C-AP-10) — never a date the facts did not carry.
  it('states the install day only when the schedule carries one', () => {
    const now = new Date('2026-08-25T12:00:00Z');
    const dated = deriveDocumentGuide({
      row: row('install'),
      now,
      schedule: {
        selection: 'primary' as never,
        fidelity: 'committed',
        positionText: 'Committed',
        install: { date: '2026-09-15', fidelity: 'committed' },
      },
    });

    expect(dated.headline).toBe('Install is three weeks out — Tuesday, September 15');
    expect(dated.action?.label).toBe("Check what's arriving");
  });

  it.each([
    ['the schedule has not answered', null],
    ['the install phase has no date', { install: { date: null, fidelity: 'committed' as const } }],
    ['the register states no day', { install: { date: '2026-09-15', fidelity: 'band' as const } }],
    ['the day has already passed', { install: { date: '2026-08-01', fidelity: 'committed' as const } }],
  ])('keeps the install sentence undated when %s', (_case, overrides) => {
    const guide = deriveDocumentGuide({
      row: row('install'),
      now: new Date('2026-08-25T12:00:00Z'),
      schedule: overrides
        ? ({ selection: 'primary', fidelity: 'committed', positionText: null, ...overrides } as never)
        : null,
    });

    expect(guide.headline).toBe('Complete the installation');
    expect(guide.headline).not.toMatch(/September|Tuesday/);
  });

  it('states the send date and the live nudge when the send wall carries them (SP-12)', () => {
    const guide = deriveDocumentGuide({
      row: row('proposal'),
      now: new Date('2026-08-25T12:00:00Z'),
      operationalNeed: null,
      proposal: {
        status: 'sent', documentKind: 'legacy', commercialState: null, projectId: null,
        sendWall: { sentText: 'Sent Aug 19', verb: 'nudge', stateWord: null },
      },
    });

    // The DAY the row carries, never the wall's relative prose.
    expect(guide.headline).toBe('Sent Aug 9 · not opened yet');
    expect(guide.action).toEqual({
      key: 'nudge-client',
      label: 'Nudge Avery Stone',
      destination: { kind: 'anchor', section: 'proposal', focusId: 'proposal-send-wall' },
    });
  });

  it('keeps the signing controls where the send wall offers no nudge', () => {
    const guide = deriveDocumentGuide({
      row: row('proposal'),
      now: new Date('2026-08-25T12:00:00Z'),
      operationalNeed: null,
      proposal: {
        status: 'sent', documentKind: 'legacy', commercialState: null, projectId: null,
        sendWall: { sentText: 'Sent Aug 19', verb: null, stateWord: 'nudged Aug 22' },
      },
    });

    expect(guide.headline).toBe('Sent Aug 9 · not opened yet');
    expect(guide.action?.label).toBe('Review signing controls');
  });

  it('never claims the proposal is unopened once the client has opened it', () => {
    const guide = deriveDocumentGuide({
      row: row('proposal', { proposal_viewed_at: '2026-08-20T12:00:00Z' }),
      now: new Date('2026-08-25T12:00:00Z'),
      operationalNeed: null,
      proposal: {
        status: 'sent', documentKind: 'legacy', commercialState: null, projectId: null,
        sendWall: { sentText: 'Sent Aug 19', verb: 'nudge', stateWord: null },
      },
    });

    expect(guide.headline).toBe('Wait for the client’s signature');
  });

  it('keeps the proposal sentence undated when the send wall has not answered', () => {
    const guide = deriveDocumentGuide({
      row: row('proposal'),
      now: new Date('2026-08-25T12:00:00Z'),
      operationalNeed: null,
      proposal: { status: 'sent', documentKind: 'legacy', commercialState: null, projectId: null },
    });

    expect(guide.headline).toBe('Wait for the client’s signature');
  });

  it('counts the days out until a fortnight, so ten days is never "one week"', () => {
    const guide = deriveDocumentGuide({
      row: row('install'),
      now: new Date('2026-08-25T12:00:00Z'),
      schedule: {
        selection: 'primary',
        fidelity: 'committed',
        positionText: 'Committed',
        install: { date: '2026-09-04', fidelity: 'committed' },
      } as never,
    });

    expect(guide.headline).toBe('Install is ten days out — Friday, September 4');
  });

  it('never reports a paper handover as unopened', () => {
    // 00477's paper door issues without sending, so the row carries no send
    // date and no open event was ever possible.
    const guide = deriveDocumentGuide({
      row: row('proposal', { proposal_sent_at: null }),
      now: new Date('2026-08-25T12:00:00Z'),
      operationalNeed: null,
      proposal: {
        status: 'sent', documentKind: 'legacy', commercialState: null, projectId: null,
        sendWall: { sentText: 'Issued on paper', verb: null, stateWord: 'awaiting the client\u2019s signature' },
      },
    });

    expect(guide.headline).toBe('Wait for the client\u2019s signature');
    expect(guide.headline).not.toMatch(/not opened yet/);
  });

  it('states what needs a decision instead of naming its own signal source (SP-06)', () => {
    const guide = deriveDocumentGuide({
      row: row('project', { overdue_decision_count: 1, earliest_overdue_due: '2026-08-01' }),
      now: new Date('2026-08-10T12:00:00Z'),
    });

    expect(guide.reason).toBe('Something on this job needs a decision.');
  });

  it('names the unavailable branch in its own eyebrow (SP-08)', () => {
    const guide = deriveDocumentGuide({ row: row('project'), availability: 'unavailable' });

    expect(guide.eyebrow).toBe('Guidance is unavailable');
    expect(guide.eyebrow).not.toBe('Next up');
  });

  it.each(['po_unacknowledged', 'po_unsent'] as const)('sends %s to the FF&E region, not the Orders ledger (C12 — the line waits on A3)', (kind) => {
    const guide = deriveDocumentGuide({
      row: row('project'),
      operationalNeed: {
        kind,
        text: 'PO-2026-0418 — fourteen days, no word from Sturdy Oak',
        actionLabel: 'Follow up with the maker',
        stamp: { label: 'NO WORD', color: 'var(--color-clay)' },
        urgent: false,
      },
    });

    expect(guide.action?.destination).toEqual({
      kind: 'anchor', section: 'project', focusId: 'ffe-region-heading-project-1',
    });
  });

  it('puts unavailable and paused states ahead of every other need', () => {
    expect(deriveDocumentGuide({ row: row('project'), availability: 'unavailable' }).state).toBe('unavailable');
    const paused = deriveDocumentGuide({
      row: row('project', { is_paused: true, overdue_decision_count: 3 }),
    });
    expect(paused.state).toBe('paused');
    expect(paused.headline).toBe('This project is paused');
  });

  it('withholds the retry instruction when nothing here can be retried', () => {
    const guide = deriveDocumentGuide({ row: row('brief'), availability: 'unavailable' });

    expect(guide.state).toBe('unavailable');
    expect(guide.action).toBeNull();
    expect(guide.reason).not.toMatch(/try again/i);
  });

  it('offers an explicit retry only when the failed source is retryable here', () => {
    const guide = deriveDocumentGuide({
      row: row('brief'), availability: 'unavailable', retryAvailable: true,
    });
    expect(guide.reason).toMatch(/try again/i);
    expect(guide.action).toEqual({
      key: 'retry-guidance',
      label: 'Try again',
      destination: { kind: 'retry' },
    });
  });

  it('puts an operational need ahead of stage guidance', () => {
    const guide = deriveDocumentGuide({
      row: row('project', { overdue_decision_count: 2, earliest_overdue_due: '2026-08-01' }),
      now: new Date('2026-08-10T12:00:00Z'),
    });
    expect(guide.state).toBe('actionable');
    expect(guide.headline).toContain('2 decisions overdue');
    expect(guide.action?.label).toBe('Chase the approval');
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
      now: new Date('2026-08-10T12:00:00Z'),
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
      now: new Date('2026-08-10T12:00:00Z'),
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
      label: 'Open the Drafting Room',
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

  it('trusts an explicit no-need answer instead of re-deriving one from the row', () => {
    const overdue = row('project', { overdue_decision_count: 2, earliest_overdue_due: '2026-08-01' });
    const now = new Date('2026-08-10T12:00:00Z');

    expect(deriveDocumentGuide({ row: overdue, now }).headline).toContain('2 decisions overdue');
    expect(deriveDocumentGuide({ row: overdue, now, operationalNeed: null }).headline).toBe(
      'The work is in motion — nothing is waiting on you',
    );
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
      label: 'Chase the approval',
      destination: {
        kind: 'anchor', section: 'discovery', focusId: 'document-decision-controls', activate: false,
      },
    });
    expect(guide.topInput?.label).toBe('Working budget');
  });

  it('lands a PO or a claim on the FF&E line once one is carried', () => {
    const po = needGuideAction(
      { kind: 'po_unacknowledged', text: 'No word', actionLabel: 'Follow up with the maker', stamp: { label: 'NO WORD', color: 'x' }, urgent: false },
      'project', 'project-1', 'line-7',
    );
    const claim = needGuideAction(
      { kind: 'damage_claim', text: 'Gouged', actionLabel: 'File the claim', stamp: { label: 'CLAIM', color: 'x' }, urgent: false },
      'project', 'project-1', 'line-7',
    );

    expect(po.destination).toEqual({ kind: 'anchor', section: 'project', focusId: 'ffe-selection-line-7' });
    expect(claim.destination).toEqual({ kind: 'anchor', section: 'project', focusId: 'ffe-selection-line-7' });
  });

  it('keeps a claim on the receiving page while no line id is carried', () => {
    const claim = needGuideAction(
      { kind: 'damage_claim', text: 'Gouged', actionLabel: 'File the claim', stamp: { label: 'CLAIM', color: 'x' }, urgent: false },
      'project', 'project-1',
    );

    expect(claim.destination).toEqual({
      kind: 'ledger', name: 'orders', context: { page: 'receiving', projectId: 'project-1' },
    });
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

// ── Ruling V — the guide surfaces the gate ─────────────────────────────────

const GATE_NOW = new Date('2026-05-12T09:00:00.000Z');

const handoff = (
  overrides: Partial<ProjectContextualHandoff> = {},
): ProjectContextualHandoff =>
  ({
    sourceKind: 'project_approval',
    sourceId: 'decision-1',
    projectId: 'project-1',
    phaseId: 'phase-1',
    canonicalStageKey: 'design_development',
    workflowTrack: 'ffe',
    stageAttribution: 'exact_project_phase',
    sourceState: 'response_required',
    responsibility: {
      sender: { kind: 'studio', label: null },
      recipient: { kind: 'client', label: null },
      currentOwner: { kind: 'client', label: null },
    },
    expectedResponse: 'select_approval_outcome',
    dueAt: '2026-05-06T09:00:00.000Z',
    isOverdue: true,
    escalation: null,
    artifact: {
      kind: 'proposal_edition',
      version: 3,
      checksum: 'c'.repeat(64),
      title: 'Direction',
    },
    actionKind: 'open_approval_response',
    updatedAt: '2026-05-06T09:00:00.000Z',
    ...overrides,
  }) as ProjectContextualHandoff;

describe('the guide surfaces the gate (Ruling V)', () => {
  it('derives its sentence and act from the nearest open gate, keyed by canonical stage', () => {
    const gate = deriveGate(handoff(), GATE_NOW, 'Marta');
    const guide = deriveDocumentGuide({ row: row('project'), gate });

    expect(guide.headline).toBe("Marta's Direction approval has waited 6 days.");
    expect(guide.eyebrow).toBe('Stage 06 · Design Development · gate');
    expect(guide.action).toEqual({
      key: 'gate-nudge',
      label: 'Nudge Marta',
      destination: {
        kind: 'anchor',
        section: 'project',
        focusId: 'document-handoff-decision-1',
      },
    });
  });

  it('never prints Review now from the branch that outranks every other (F18)', () => {
    // The gate branch sits above the operational need and the stage default,
    // so its own fallback label was the last live `Review now` on the paper.
    const gate = { ...deriveGate(handoff(), GATE_NOW, 'Marta'), act: null };
    const guide = deriveDocumentGuide({ row: row('project'), gate });

    expect(guide.action?.label).toBe('Resolve the Direction approval');
    expect(guide.action?.label).not.toMatch(/Review now/);
  });

  it('names the publish act from the gate rather than the stage default', () => {
    // Projection-realistic: confirmations complete addresses the row to the
    // studio, so the sentence must not hand the act to the household.
    const gate = deriveGate(
      handoff({
        sourceState: 'ready_to_publish' as never,
        isOverdue: false,
        expectedResponse: 'publish_confirmed_approval',
        responsibility: {
          sender: { kind: 'client', label: null },
          recipient: { kind: 'studio', label: null },
          currentOwner: { kind: 'studio', label: null },
        },
      } as never),
      GATE_NOW,
      'Marta',
    );
    const guide = deriveDocumentGuide({ row: row('project'), gate });

    expect(guide.state).toBe('actionable');
    expect(guide.headline).toBe('Direction approval is ready to publish.');
    expect(guide.action?.label).toBe('Publish the Direction approval');
    expect(guide.headline).not.toContain('Marta');
  });

  it('never activates the control it names, so it cannot close an open item', () => {
    const gate = deriveGate(handoff(), GATE_NOW, 'Marta');
    const guide = deriveDocumentGuide({ row: row('project'), gate });

    expect(guide.action?.destination).not.toHaveProperty('activate', true);
  });

  it('outranks the operational need, which no longer gets to decide', () => {
    const gate = deriveGate(handoff(), GATE_NOW, 'Marta');
    const overdue = row('project', {
      overdue_decision_count: 2,
      earliest_overdue_due: '2026-05-06T09:00:00Z',
    });

    expect(deriveDocumentGuide({ row: overdue, gate }).headline).toBe(
      "Marta's Direction approval has waited 6 days.",
    );
    // Without a gate the row's own derivation still answers.
    expect(
      deriveDocumentGuide({ row: overdue, now: GATE_NOW }).headline,
    ).toContain('2 decisions overdue');
  });

  it('yields to a paused project — a gate cannot resume lifecycle work', () => {
    const gate = deriveGate(handoff(), GATE_NOW, 'Marta');
    const guide = deriveDocumentGuide({
      row: row('project', { is_paused: true }),
      gate,
    });

    expect(guide.state).toBe('paused');
    expect(guide.headline).toBe('This project is paused');
  });

  it('leaves the strip whole when the gate read has not answered', () => {
    const guide = deriveDocumentGuide({ row: row('project'), gate: undefined });
    expect(guide.state).not.toBe('unavailable');
    expect(guide.headline).toBe('The work is in motion — nothing is waiting on you');
  });

  it('keeps withInputs from displacing the gate act', () => {
    const gate = deriveGate(handoff(), GATE_NOW, 'Marta');
    const guide = deriveDocumentGuide({
      row: row('project'),
      gate,
      inputFacts: [
        {
          label: 'Working budget',
          owner: 'Client',
          blocks: 'Direction',
          focusId: 'discovery-facet-budget',
        },
      ],
    });

    expect(guide.action?.key).toBe('gate-nudge');
    expect(guide.topInput?.label).toBe('Working budget');
  });

  it('shows no checksum or escalation register in anything it says', () => {
    const gate = deriveGate(handoff(), GATE_NOW, 'Marta');
    const guide = deriveDocumentGuide({ row: row('project'), gate });
    const spoken = [guide.eyebrow, guide.headline, guide.reason, guide.action?.label].join(' ');

    expect(spoken).not.toContain('c'.repeat(8));
    expect(spoken).not.toMatch(/exact phase|source domain|reminder sent/i);
  });
});
