import {
  ACT_TARGET_IDS,
  ACT_TIER,
  FORBIDDEN_ACT_LABELS,
  MESSAGE_WITHHELD,
  NAMED_ACTS,
  NEED_ACT_LABELS,
  STAGE_WORD,
  STAGE_WORDS,
  messageLabel,
  needActLabel,
  ownAct,
  stageEyebrow,
  type OwnAct,
  type OwnActFacts,
} from '../act-names';
import type { SectionKey } from '../desk-derivation';

const quiet: OwnActFacts = {
  inquiryOpen: false,
  firstMissingEssential: null,
  proposalState: null,
  clientFirstName: null,
  unspecifiedCount: 0,
  releaseEligible: false,
  install: null,
};

const facts = (over: Partial<OwnActFacts>): OwnActFacts => ({ ...quiet, ...over });

describe('stage words (D1, Q4)', () => {
  it('are the seven document words, in order', () => {
    expect(STAGE_WORDS).toEqual([
      'Brief',
      'Discovery',
      'Direction',
      'Proposal',
      'Project',
      'Install',
      'Care',
    ]);
  });

  it('map every section id to its word', () => {
    const sections: SectionKey[] = [
      'brief',
      'discovery',
      'direction',
      'proposal',
      'project',
      'install',
      'care',
    ];
    expect(sections.map((s) => STAGE_WORD[s])).toEqual([...STAGE_WORDS]);
  });
});

describe('stageEyebrow (D1, Q5)', () => {
  it('prints the stage and the name normally', () => {
    expect(stageEyebrow('project', 'active', 'Chen Residence')).toEqual({
      stage: 'Project',
      detail: 'Chen Residence',
    });
  });

  it('prints On hold, with no date, when the project is held', () => {
    expect(stageEyebrow('project', 'on_hold', 'Chen Residence')).toEqual({
      stage: 'Project',
      detail: 'On hold',
    });
  });

  it('prints Care · Closed when the project is completed', () => {
    expect(stageEyebrow('care', 'completed', 'Chen Residence')).toEqual({
      stage: 'Care',
      detail: 'Closed',
    });
  });
});

describe('ownAct (D1 own-act table)', () => {
  const cases: [string, SectionKey, Partial<OwnActFacts>, OwnAct][] = [
    ['Brief', 'brief', { inquiryOpen: true },
      { label: 'Respond to the inquiry', targetId: ACT_TARGET_IDS.inquiryReply, tier: 'scored' }],
    ['Discovery, project type', 'discovery', { firstMissingEssential: 'project_type' },
      { label: 'Add the project type', targetId: ACT_TARGET_IDS.essentialProjectType, tier: 'scored' }],
    ['Discovery, rooms', 'discovery', { firstMissingEssential: 'rooms' },
      { label: 'Add the rooms', targetId: ACT_TARGET_IDS.essentialRooms, tier: 'scored' }],
    ['Discovery, scope', 'discovery', { firstMissingEssential: 'scope' },
      { label: 'Add the scope', targetId: ACT_TARGET_IDS.essentialScope, tier: 'scored' }],
    ['Discovery, budget band', 'discovery', { firstMissingEssential: 'budget_band' },
      { label: 'Add the budget band', targetId: ACT_TARGET_IDS.essentialBudgetBand, tier: 'scored' }],
    ['Direction', 'direction', {},
      { label: 'Write the proposal', targetId: ACT_TARGET_IDS.contractRoomDoor, tier: 'scored' }],
    ['Proposal, draft', 'proposal', { proposalState: 'draft' },
      { label: 'Send the proposal', targetId: ACT_TARGET_IDS.proposalSend, tier: 'filled' }],
    ['Proposal, sent, named', 'proposal', { proposalState: 'sent', clientFirstName: 'Mei' },
      { label: 'Nudge Mei', targetId: ACT_TARGET_IDS.proposalNudge, tier: 'scored' }],
    ['Proposal, sent, no name', 'proposal', { proposalState: 'sent', clientFirstName: null },
      { label: 'Nudge the client', targetId: ACT_TARGET_IDS.proposalNudge, tier: 'scored' }],
    ['Proposal, accepted', 'proposal', { proposalState: 'accepted' },
      { label: 'Open the project', targetId: ACT_TARGET_IDS.projectPaper, tier: 'scored' }],
    ['Project, unspecified lines', 'project', { unspecifiedCount: 3, releaseEligible: true },
      { label: 'Spec the 3 unspecified', targetId: ACT_TARGET_IDS.piecesHead, tier: 'scored' }],
    ['Project, eligible to release', 'project', { releaseEligible: true },
      { label: 'Release for authorization', targetId: ACT_TARGET_IDS.piecesHead, tier: 'filled' }],
    ['Project, otherwise', 'project', {},
      { label: 'Open the pieces', targetId: ACT_TARGET_IDS.piecesHead, tier: 'scored' }],
    ['Install, no arrival date', 'install', { install: { state: 'not_here_undated', windowHeld: false } },
      { label: 'Ask the maker for a date', targetId: ACT_TARGET_IDS.installReading, tier: 'scored' }],
    ['Install, arrival date passed', 'install', { install: { state: 'not_here_past', windowHeld: true } },
      { label: 'Ask the maker for a date', targetId: ACT_TARGET_IDS.installReading, tier: 'scored' }],
    ['Install, arriving, no window', 'install', { install: { state: 'not_here_ahead', windowHeld: false } },
      { label: 'Hold a window', targetId: ACT_TARGET_IDS.installWindow, tier: 'scored' }],
    ['Install, everything here', 'install', { install: { state: 'all_here', windowHeld: false } },
      { label: 'Open the punch list', targetId: ACT_TARGET_IDS.punchList, tier: 'scored' }],
    ['Care', 'care', {},
      { label: 'Run the closeout checklist', targetId: ACT_TARGET_IDS.closeoutChecklist, tier: 'scored' }],
  ];

  it.each(cases)('%s', (_name, stage, over, expected) => {
    expect(ownAct(stage, facts(over))).toEqual(expected);
  });

  it('is silent while a piece arrives and a window is already held (D6)', () => {
    expect(
      ownAct('install', facts({ install: { state: 'not_here_ahead', windowHeld: true } })),
    ).toBeNull();
  });
});

describe('Message (D1, D3, D7)', () => {
  it('names the client, or says "the client" with no name', () => {
    expect(messageLabel('Mei')).toBe('Message Mei');
    expect(messageLabel(null)).toBe('Message the client');
    expect(messageLabel('  ')).toBe('Message the client');
  });

  it('withholds with a reason and a repair act', () => {
    expect(MESSAGE_WITHHELD).toEqual({ reason: 'Link a client first.', repair: 'Link a client' });
  });
});

describe('needActLabel (D1 rule of names)', () => {
  it('lets the named and own acts win over both sources', () => {
    expect(needActLabel('damage_claim')).toBe('File the claim');
    expect(needActLabel('payment_due')).toBe('Record the payment');
    expect(needActLabel('new_lead')).toBe('Respond to the inquiry');
  });
});

describe('every act string', () => {
  const ownActLabels = (
    [
      ['brief', { inquiryOpen: true }],
      ['discovery', { firstMissingEssential: 'rooms' }],
      ['direction', {}],
      ['proposal', { proposalState: 'draft' }],
      ['proposal', { proposalState: 'sent', clientFirstName: null }],
      ['proposal', { proposalState: 'accepted' }],
      ['project', { unspecifiedCount: 2 }],
      ['project', { releaseEligible: true }],
      ['project', {}],
      ['install', { install: { state: 'not_here_undated', windowHeld: false } }],
      ['install', { install: { state: 'not_here_ahead', windowHeld: false } }],
      ['install', { install: { state: 'all_here', windowHeld: false } }],
      ['care', {}],
    ] as [SectionKey, Partial<OwnActFacts>][]
  ).map(([stage, over]) => ownAct(stage, facts(over))?.label ?? '');

  const printed = [
    ...Object.keys(ACT_TIER),
    ...Object.values(NAMED_ACTS),
    ...Object.values(NEED_ACT_LABELS),
    ...ownActLabels,
    messageLabel(null),
    messageLabel('Mei'),
    MESSAGE_WITHHELD.repair,
  ];

  it('never prints a label from D1\'s "Never" column', () => {
    const exact = new Set<string>(FORBIDDEN_ACT_LABELS.exact);
    const offenders = printed.filter(
      (label) =>
        exact.has(label) ||
        FORBIDDEN_ACT_LABELS.prefix.some((prefix) => label.startsWith(prefix)),
    );
    expect(offenders).toEqual([]);
  });

  it('has a D3 tier', () => {
    const fixed = [
      ...Object.values(NAMED_ACTS),
      ...Object.values(NEED_ACT_LABELS),
      MESSAGE_WITHHELD.repair,
    ];
    expect(fixed.filter((label) => !(label in ACT_TIER))).toEqual([]);
    expect(Object.values(ACT_TIER).every((t) => ['filled', 'scored', 'plain'].includes(t))).toBe(true);
  });

  it('keeps the four filled acts filled and the four named acts scored (D3)', () => {
    for (const label of [
      'Record the payment',
      'Release for authorization',
      'Send the proposal',
      'Send the invoice',
    ]) {
      expect(ACT_TIER[label]).toBe('filled');
    }
    for (const label of [
      'Record a change',
      'Ask the maker for a date',
      'Open the order',
      'File the claim',
    ]) {
      expect(ACT_TIER[label]).toBe('scored');
    }
  });
});
