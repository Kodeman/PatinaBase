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
 * The ones this slice does not settle stand as `it.todo`, each with its reason;
 * FR2 499-8 made 3, 11 and 12 live (5 belongs to its own ticket).
 */
import type { ProjectContextualHandoff } from '@patina/supabase';
import {
  ACT_TIER,
  NAMED_ACTS,
  NEED_ACT_LABELS,
  STAGE_WORD,
  ffeActLandingOf,
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
  rankStanding,
  type LensOwnAct,
  type LensStandingItem,
} from '../lens-band-derivation';
import { classOfStandingRow } from '../need-class';
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

  it('3 · Discovery: the own act is Add the {first missing essential}, in the essentials’ order (FR2 499-8)', () => {
    const order = ['project_type', 'rooms', 'scope', 'budget_band'] as const;
    expect(
      order.map((essential) => ownAct('discovery', facts({ firstMissingEssential: essential }))!.label),
    ).toEqual(['Add the project type', 'Add the rooms', 'Add the scope', 'Add the budget band']);
    for (const essential of order) {
      expect(ownAct('discovery', facts({ firstMissingEssential: essential }))!.tier).toBe('scored');
    }
    // Every essential set: no own act (FR1 R8).
    expect(ownAct('discovery', quietFacts)).toBeNull();
  });

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

    it('9b · the band names the client’s first name, as the Desk and the guide do (499-1)', () => {
      const need = needOf('overdue_decision', { owner: 'client' });
      const guide = needGuideAction(need, 'project', 'project-1', null, {
        oneVoice: true,
        clientFirstName: 'Mei',
      }).label;
      // The row arrives with its source's label; the band renames it.
      const next = deriveNext({
        standing: [standingOf(need, 'Send a reminder')],
        ownAct: null,
        clientFirstName: 'Mei',
        closed: false,
      });
      expect(next?.act.label).toBe('Nudge Mei');
      expect(next?.act.label).toBe(guide);
      expect(next?.act.label).toBe(deskActionLabel(need, true, 'Mei'));
    });
  });

  it('10 · Project at rest names the real control, Release for authorization', () => {
    expect(deriveDocumentGuide({ row: row('project') }).action?.label).toBe('Release the next room');
    expect(deriveDocumentGuide({ row: row('project'), oneVoice: true }).action?.label).toBe(
      ownAct('project', facts({ releaseEligible: true }))!.label,
    );
  });

  it('11 · Install at rest: Hold the window becomes Hold a window, the own act’s name (FR2 499-8)', () => {
    const own = ownAct(
      'install',
      facts({ install: { state: 'not_here_ahead', windowHeld: false } }),
    )!;
    expect(own.label).toBe('Hold a window');
    // At rest: a committed install day ahead of today.
    const atRest = {
      row: row('install'),
      now: new Date('2026-10-07T12:00:00Z'),
      schedule: {
        selection: 'install',
        fidelity: 'committed',
        positionText: 'Committed',
        install: { date: '2026-11-12', fidelity: 'committed' },
      },
    } as unknown as Parameters<typeof deriveDocumentGuide>[0];
    expect(deriveDocumentGuide(atRest).action?.label).toBe('Hold the window');
    expect(deriveDocumentGuide({ ...atRest, oneVoice: true }).action?.label).toBe(own.label);
  });

  it('12 · Care: the own act is Run the closeout checklist, the studio’s, never in the custody form (FR2 499-8)', () => {
    const own = ownAct('care', quietFacts)!;
    expect(own.label).toBe('Run the closeout checklist');
    expect(own.tier).toBe('scored');
    // At rest: the care band's closure gate stands ready.
    const care = row('care');
    expect(deriveDocumentGuide({ row: care, closureReady: true }).action?.label).toBe(
      'Close the book',
    );
    expect(
      deriveDocumentGuide({ row: care, closureReady: true, oneVoice: true }).action?.label,
    ).toBe(own.label);
    // Studio-owned: the band names it with no custody (`Waiting on …`, `With
    // the maker`), even where the client has a first name.
    const next = deriveNext({
      standing: [],
      ownAct: lensOwnAct('care', {}),
      clientFirstName: 'Mei',
      closed: false,
    });
    expect(next?.act.label).toBe(own.label);
    expect(next?.sentence).not.toMatch(/^(Waiting on|With the maker)/);
  });

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

  // US-19 F6-8 (D16) — the band's File the claim lands by its name, not the
  // control's string; the claim control it lands on (ClaimActs, the Receiving
  // card: their suites render it) and the claim-window act name the maker.
  it('Olsen: the claim landing and the claim window say Notify the maker', () => {
    const olsen = row('install', { client_name: 'Per Olsen', title: 'Olsen Residence' });
    const claim = needOf('damage_claim');
    const next = deriveNext({
      standing: [standingOf(claim, needGuideAction(claim, 'install', 'project-1', null, chenVoice).label)],
      ownAct: null,
      clientFirstName: null,
      closed: false,
    });
    expect(next?.act.label).toBe(NAMED_ACTS.fileClaim);
    expect(ffeActLandingOf(next!.act.label)).toBe('claim');

    const claimWindow = needOf('claim_window');
    const guide = needGuideAction(claimWindow, 'install', 'project-1', null, chenVoice).label;
    expect(guide).toBe('Notify the maker');
    expect(deskCard(olsen, claimWindow)).toBe('Notify the maker');
    expect(deskCard(olsen, claimWindow, false)).toBe('Notify the vendor');
    expect(needActLabel('ack_discrepancy')).toBe('Answer the maker');
  });
});

// US-19 FR3 F3-4 (2-2 a) — the Desk's lead need is the band's Next. Both are
// derived here from the same chain of needs: the band the way
// `deriveLensBand` builds line 2 (`rankStanding`, class 3 to `SETUP`, then
// `deriveNext`), the Desk the way the Desk page builds its roster.
describe('the Desk leads with the band’s Next (FR3 F3-4)', () => {
  const now = new Date('2026-08-10T12:00:00Z');
  const setupNeed = needOf('schedule_unconfigured', { text: 'Name the phases for this project' });

  const bandNext = (needs: NeedLine[], own: LensOwnAct | null, first: string | null) => {
    const ranked = rankStanding(
      [],
      needs.map((need, index) => ({ ...need, key: `n${index}`, onAct: noop })),
      now,
    );
    return deriveNext({
      standing: ranked.filter((item) => classOfStandingRow(item) !== 3),
      setup: ranked
        .filter((item) => classOfStandingRow(item) === 3)
        .map((item) => ({
          key: item.key,
          setup: 'schedule_unconfigured' as const,
          sentence: item.sentence,
          act: item.act,
          opensSheet: false,
        })),
      ownAct: own,
      clientFirstName: first,
      closed: false,
    });
  };
  const deskLead = (r: DocumentStateRow, needs: NeedLine[]) =>
    deriveDeskRoster(
      { folders: [{ row: r, need: needs[0], needs }], chips: [], live: [r], oneVoice: true },
      now,
    ).groups[0].lines[0];

  it('Halloran: Follow up with the maker on the Desk and the band, never the setup row', () => {
    const halloran = row('project', { client_name: 'Ruth Halloran', title: 'Halloran House' });
    const po = needOf('po_unacknowledged', {
      text: 'NA-2026-077 sent 6 days ago — no acknowledgment',
      owner: 'maker',
    });
    const needs = [setupNeed, po];
    const band = bandNext(needs, lensOwnAct('project', {}), 'Ruth');
    const desk = deskLead(halloran, needs);
    expect(band?.act.label).toBe('Follow up with the maker');
    expect(desk.act.label).toBe(band?.act.label);
    expect(desk.needText).toBe(po.text);
  });

  it('a payment due (class 1) leads an overdue decision on both', () => {
    const aspen = row('project', { client_name: 'Mei Lin', title: 'Aspen Loft Refresh' });
    const decision = needOf('overdue_decision', { owner: 'client' });
    const needs = [decision, setupNeed, chenPayment];
    const band = bandNext(needs, lensOwnAct('project', {}), 'Mei');
    expect(band?.act.label).toBe('Record the payment');
    expect(deskLead(aspen, needs).act.label).toBe(band?.act.label);
  });
});
