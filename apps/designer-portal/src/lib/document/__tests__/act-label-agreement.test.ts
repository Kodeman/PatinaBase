/**
 * US-19 2-B (SQ-499) — one name per act, across surfaces and devices.
 *
 * Each surface that prints an act is derived here from the same state, the way
 * the page derives it, and the strings must agree (D1). With `one-voice` on:
 *
 *   band   — `deriveNext` over the standing rows and the stage's own act
 *   dock   — the phone's centre registers that same `LensNext` (page.tsx,
 *            SQ-500), so it prints the band's act in full
 *   Desk   — `deskActionLabel`, which the folder card prints
 *   guide  — `deriveDocumentGuide` / `needGuideAction`, which feed the band's
 *            standing rows and the red-letter list
 *   ⌘K     — the stage rows read `STAGE_WORD`, the act rows `NAMED_ACTS`
 *   head   — the region head's leader, the stage's own act (`ownAct`)
 *
 * The 13 cross-device contradictions are those of
 * `artifacts/document-running-a-job-2026-10-07/briefing/current-state.md`.
 * The ones this slice does not settle stand as `it.todo`, each with its reason.
 */
import type { ProjectContextualHandoff } from '@patina/supabase';
import {
  ACT_TIER,
  NAMED_ACTS,
  NEED_ACT_LABELS,
  STAGE_WORD,
  needActLabel,
  ownAct,
  stageEyebrow,
  type OwnActFacts,
} from '../act-names';
import {
  NEED_ACTION_LABELS,
  deskActionLabel,
  type DocumentStateRow,
  type NeedKind,
  type NeedLine,
  type SectionKey,
} from '../desk-derivation';
import { deriveDeskRoster } from '../desk-roster-derivation';
import { deriveDocumentGuide, needGuideAction, voiceFirstName } from '../document-guide';
import {
  deriveNext,
  type LensOwnAct,
  type LensStandingItem,
} from '../lens-band-derivation';
import { deriveGate } from '../workflow-gate';

const noop = () => {};

const quietFacts: OwnActFacts = {
  inquiryOpen: false,
  firstMissingEssential: null,
  proposalState: null,
  clientFirstName: null,
  unspecifiedCount: 0,
  releaseEligible: false,
  install: null,
};
const facts = (over: Partial<OwnActFacts>): OwnActFacts => ({ ...quietFacts, ...over });

const row = (activeSection: SectionKey, overrides: Partial<DocumentStateRow> = {}) =>
  ({
    engagement_kind:
      activeSection === 'brief'
        ? 'lead'
        : activeSection === 'direction' || activeSection === 'proposal'
          ? 'proposal'
          : 'project',
    engagement_id: 'engagement-1',
    project_id: ['project', 'install', 'care'].includes(activeSection) ? 'project-1' : null,
    proposal_id: activeSection === 'direction' || activeSection === 'proposal' ? 'proposal-1' : null,
    lead_id: activeSection === 'brief' ? 'lead-1' : null,
    designer_id: 'designer-1',
    client_profile_id: 'client-1',
    client_name: 'Mei Lin',
    title: 'Lin Residence',
    active_section: activeSection,
    project_status: 'active',
    current_phase: 'design_development',
    is_paused: false,
    is_archived: false,
    proposal_status:
      activeSection === 'direction' ? 'draft' : activeSection === 'proposal' ? 'sent' : null,
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

const needOf = (kind: NeedKind, over: Partial<NeedLine> = {}): NeedLine =>
  ({
    kind,
    text: `A ${kind} need`,
    actionLabel: NEED_ACTION_LABELS[kind],
    stamp: { label: kind.toUpperCase(), color: 'var(--color-terracotta)' },
    urgent: false,
    owner: 'designer',
    ...over,
  }) as NeedLine;

/** A sheet row as the page builds it: the guide's act for the need. */
const standingOf = (need: NeedLine, actLabel: string): LensStandingItem => ({
  key: `need-${need.kind}`,
  eyebrow: need.stamp.label,
  sentence: need.text,
  act: { key: `act-${need.kind}`, label: actLabel, onAct: noop },
  tier: 'overdue',
  days: 148,
  deadline: null,
  standingSince: null,
  sense: 'past',
  distance: 148,
  namesMoney: true,
  needKind: need.kind,
  owner: need.owner,
  short: { state: 'OVERDUE', days: 148, subject: 'WS-188' },
});

const lensOwnAct = (stage: SectionKey, over: Partial<OwnActFacts>): LensOwnAct => {
  const own = ownAct(stage, facts(over))!;
  return { key: `own-${stage}`, ...own, sentence: 'The stage’s own sentence.', onAct: noop };
};

// ── Chen: a project, no client linked, a maker balance overdue, 3 unspecified.
const chenRow = row('project', {
  client_profile_id: null,
  client_name: '',
  title: 'Chen Residence',
});
const chenFirst = voiceFirstName(chenRow.client_name);
const chenPayment = needOf('payment_due', {
  text: 'Balance to Woodward & Sons · $4,060.00 due 12 May — WS-188',
  stamp: { label: 'PAYMENT DUE', color: 'var(--color-terracotta)' },
  ledger: { name: 'orders', context: { page: 'payments', projectId: 'project-1' } },
});
const chenVoice = { oneVoice: true, clientFirstName: chenFirst };

function chenSurfaces() {
  const guide = deriveDocumentGuide({ row: chenRow, operationalNeed: chenPayment, oneVoice: true });
  const sheetRow = needGuideAction(chenPayment, 'project', 'project-1', null, chenVoice);
  const next = deriveNext({
    standing: [standingOf(chenPayment, sheetRow.label)],
    ownAct: lensOwnAct('project', { unspecifiedCount: 3 }),
    clientFirstName: chenFirst,
    closed: false,
  });
  return {
    guide: guide.action?.label ?? null,
    band: next?.act.label ?? null,
    bandTier: next?.act.tier ?? null,
    // The dock's centre is the same LensNext the band prints (SQ-500).
    dock: next?.act.label ?? null,
    desk: deskActionLabel(chenPayment, true, chenFirst),
    piecesHead: ownAct('project', facts({ unspecifiedCount: 3 }))!,
  };
}

describe('Chen — the five surfaces agree (2-2)', () => {
  it('has no client first name to print', () => {
    expect(chenFirst).toBeNull();
  });

  it('names the payment Record the payment on the band, dock, Desk card and guide', () => {
    const s = chenSurfaces();
    expect(s.band).toBe('Record the payment');
    expect(s.dock).toBe(s.band);
    expect(s.desk).toBe(s.band);
    expect(s.guide).toBe(s.band);
  });

  it('prints the source labels it replaced while the flag is off', () => {
    expect(deskActionLabel(chenPayment, false)).toBe('Record payment');
    expect(
      deriveDocumentGuide({ row: chenRow, operationalNeed: chenPayment }).action?.label,
    ).toBe('Record payment');
  });

  it('leads the Pieces head with the stage’s own act, Spec the 3 unspecified', () => {
    expect(chenSurfaces().piecesHead.label).toBe('Spec the 3 unspecified');
  });

  it('prints the stage word ⌘K’s stage rows print, never the workflow’s', () => {
    expect(stageEyebrow('project', 'active', 'Chen Residence').stage).toBe(STAGE_WORD.project);
    expect(STAGE_WORD.project).toBe('Project');
  });

  it('names Record a change once, for the ⌘K row and the Money head', () => {
    expect(NAMED_ACTS.recordChange).toBe('Record a change');
  });
});

describe('Chen — weight by role (2-5)', () => {
  it('fills Record the payment, and nothing else Chen prints', () => {
    const s = chenSurfaces();
    const printed: [string, string][] = [
      [s.band!, s.bandTier!],
      [s.piecesHead.label, s.piecesHead.tier],
      ['Draw an invoice', ACT_TIER['Draw an invoice']],
      [NAMED_ACTS.recordChange, ACT_TIER[NAMED_ACTS.recordChange]],
    ];
    expect(printed.filter(([, tier]) => tier === 'filled').map(([label]) => label)).toEqual([
      'Record the payment',
    ]);
  });

  it('leaves Draw an invoice and Spec the 3 unspecified scored or plain', () => {
    expect(['scored', 'plain']).toContain(ACT_TIER['Draw an invoice']);
    expect(['scored', 'plain']).toContain(chenSurfaces().piecesHead.tier);
    expect(['scored', 'plain']).toContain(ACT_TIER['Open the record']);
  });
});

describe('Direction — the surfaces agree (2-2)', () => {
  const ownLabel = ownAct('direction', quietFacts)!.label;

  it('names the Contract Room door Write the proposal', () => {
    expect(ownLabel).toBe('Write the proposal');
  });

  it('prints it on the guide, the band and the dock, drafting or written', () => {
    const drafting = deriveDocumentGuide({ row: row('direction'), inputsPending: true, oneVoice: true });
    const written = deriveDocumentGuide({ row: row('direction'), oneVoice: true });
    const next = deriveNext({
      standing: [],
      ownAct: lensOwnAct('direction', {}),
      clientFirstName: 'Mei',
      closed: false,
    });
    expect(drafting.action?.label).toBe(ownLabel);
    expect(written.action?.label).toBe(ownLabel);
    expect(next?.act.label).toBe(ownLabel);
  });
});

describe('the 13 cross-device contradictions, under one-voice', () => {
  it('1 · Brief prints no stand-in for the triage control: no act at rest', () => {
    expect(deriveDocumentGuide({ row: row('brief'), oneVoice: true }).action).toBeNull();
  });

  it('2 · Brief new lead: Respond to the inquiry, and the Desk folio still prints none', () => {
    const lead = needOf('new_lead');
    const guide = deriveDocumentGuide({ row: row('brief'), operationalNeed: lead, oneVoice: true });
    expect(guide.action?.label).toBe(ownAct('brief', facts({ inquiryOpen: true }))!.label);
    expect(guide.action?.label).toBe('Respond to the inquiry');
    expect(deskActionLabel(lead, true)).toBeNull();
  });

  it.todo(
    '3 · Discovery: the guide’s essential names vs the facets’ names — `Add the {essential}` is not wired into the guide (needs the discovery facet names; out of this slice)',
  );

  it('4 · Direction: Open the Contract Room and Send the agreement collapse to Write the proposal', () => {
    const drafting = deriveDocumentGuide({ row: row('direction'), inputsPending: true });
    const written = deriveDocumentGuide({ row: row('direction') });
    expect(drafting.action?.label).toBe('Open the Contract Room');
    expect(written.action?.label).toBe('Send the agreement');
    for (const input of [{ inputsPending: true }, {}]) {
      expect(
        deriveDocumentGuide({ row: row('direction'), ...input, oneVoice: true }).action?.label,
      ).toBe('Write the proposal');
    }
  });

  it('5 · Direction: Open the Contract Room retires on ⌘K and the Desk — both print Write the proposal (FR2 499-8(5), F2-14)', () => {
    // command-bar.tsx and desk-contents.tsx print this one string under
    // one-voice (command-bar-paper.test.tsx renders the ⌘K row).
    expect(ownAct('direction', quietFacts)!.label).toBe('Write the proposal');
    expect(ACT_TIER['Write the proposal']).toBe('scored');
  });

  it('6 · Proposal draft: the guide names the control’s act, Write the proposal', () => {
    const draft = row('proposal', { proposal_status: 'draft' } as Partial<DocumentStateRow>);
    expect(deriveDocumentGuide({ row: draft }).action?.label).toBe('Open Contract Room');
    expect(deriveDocumentGuide({ row: draft, oneVoice: true }).action?.label).toBe(
      'Write the proposal',
    );
  });

  it('7 · Proposal accepted: Open the project, the control’s label', () => {
    const accepted = row('proposal', { proposal_status: 'accepted' } as Partial<DocumentStateRow>);
    expect(deriveDocumentGuide({ row: accepted, oneVoice: true }).action?.label).toBe(
      ownAct('proposal', facts({ proposalState: 'accepted' }))!.label,
    );
  });

  it('8 · Proposal expired or declined: the guide is silent (FR1 R8), never “follow up”', () => {
    for (const status of ['expired', 'declined']) {
      const r = row('proposal', { proposal_status: status } as Partial<DocumentStateRow>);
      expect(deriveDocumentGuide({ row: r }).action?.label).toBe('Review follow-up controls');
      expect(deriveDocumentGuide({ row: r, oneVoice: true }).action).toBeNull();
    }
  });

  describe('9 · the guide’s needVerb and the Desk’s NEED_ACTION_LABELS agree on every need', () => {
    const kinds = Object.keys(NEED_ACT_LABELS) as NeedKind[];

    it.each(kinds)('%s', (kind) => {
      const need = needOf(kind);
      const guide = needGuideAction(need, 'project', 'project-1', null, {
        oneVoice: true,
        clientFirstName: 'Mei',
      }).label;
      expect(guide).toBe(needActLabel(kind, 'Mei'));
      // The Desk prints an act only where it printed one before (no layout change).
      const desk = deskActionLabel(need, true, 'Mei');
      if (NEED_ACTION_LABELS[kind] === null) expect(desk).toBeNull();
      else expect(desk).toBe(guide);
    });

    it('agrees with the band where no client is named', () => {
      for (const kind of kinds) {
        const need = needOf(kind);
        const sheet = needGuideAction(need, 'project', 'project-1', null, chenVoice).label;
        const next = deriveNext({
          standing: [standingOf(need, sheet)],
          ownAct: null,
          clientFirstName: null,
          closed: false,
        });
        expect(next?.act.label).toBe(sheet);
      }
    });

    it.todo(
      '9b · the band names the client’s first name — lens-band-derivation’s voiceItem passes none (SQ-2A’s file), so it prints “Nudge the client” where the Desk prints “Nudge Mei”',
    );
  });

  it('10 · Project at rest names the real control, Release for authorization', () => {
    expect(deriveDocumentGuide({ row: row('project') }).action?.label).toBe('Release the next room');
    expect(deriveDocumentGuide({ row: row('project'), oneVoice: true }).action?.label).toBe(
      ownAct('project', facts({ releaseEligible: true }))!.label,
    );
  });

  it.todo(
    '11 · Install at rest: Hold the window lands on the FF&E anchor, not the window ceremony — the install reading (D6) owns the act; out of this slice',
  );

  it.todo(
    '12 · Care: the guide is not ownership-aware — behavioural (who may close the book), not a name; out of this slice',
  );

  it('13 · a gate keeps the seven stage words, never the workflow’s eleven', () => {
    const gate = deriveGate(
      {
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
        artifact: { kind: 'proposal_edition', version: 3, checksum: 'c'.repeat(64), title: 'Direction' },
        actionKind: 'open_approval_response',
        updatedAt: '2026-05-06T09:00:00.000Z',
      } as ProjectContextualHandoff,
      new Date('2026-05-12T09:00:00.000Z'),
      'Mei',
    );
    expect(deriveDocumentGuide({ row: chenRow, gate }).eyebrow).toBe(
      'Stage 06 · Design Development · gate',
    );
    expect(deriveDocumentGuide({ row: chenRow, gate, oneVoice: true }).eyebrow).toBe(
      `${STAGE_WORD.project} · gate`,
    );
  });
});

// US-19 FR2 F2-2 — the Desk card prints the act the band prints. The Desk's
// cards are the roster's lines (ledger rows and claim cards print
// `line.act.label`), derived here the way the Desk page derives them.
describe('the Desk card speaks the band’s act (FR2 F2-2, 2-2)', () => {
  const deskCard = (r: DocumentStateRow, need: NeedLine, oneVoice = true) =>
    deriveDeskRoster({ folders: [{ row: r, need }], chips: [], live: [r], oneVoice }, new Date(
      '2026-08-10T12:00:00Z',
    )).groups[0].lines[0].act.label;

  it('Chen: Record the payment, as the band and the guide print it', () => {
    const band = chenSurfaces().band;
    expect(deskCard(chenRow, chenPayment)).toBe('Record the payment');
    expect(deskCard(chenRow, chenPayment)).toBe(band);
    expect(deskCard(chenRow, chenPayment, false)).toBe('Record payment');
  });

  it('Aspen: Nudge {first}, with the client’s first name', () => {
    const aspen = row('project', { client_name: 'Mei Lin', title: 'Aspen Residence' });
    const decision = needOf('overdue_decision', { owner: 'client' });
    const first = voiceFirstName(aspen.client_name);
    expect(first).toBe('Mei');
    expect(deskCard(aspen, decision)).toBe('Nudge Mei');
    expect(deskCard(aspen, decision)).toBe(needActLabel('overdue_decision', first));
    expect(deskCard(aspen, decision, false)).toBe('Review decisions');
  });

  it('Olsen: File the claim, the named act the band and head print', () => {
    const olsen = row('install', { client_name: 'Per Olsen', title: 'Olsen Residence' });
    const claim = needOf('damage_claim');
    expect(deskCard(olsen, claim)).toBe(NAMED_ACTS.fileClaim);
    expect(deskCard(olsen, claim, false)).toBe('Review the claim');
  });
});
