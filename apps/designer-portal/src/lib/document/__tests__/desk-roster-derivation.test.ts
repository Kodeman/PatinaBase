import type {
  DeskFolder,
  DocumentStateRow,
  MotionChip,
  MotionKind,
  NeedKind,
  NeedLine,
  SectionKey,
} from '@/lib/document/desk-derivation';
import {
  custodyWord,
  deriveDeskClaims,
  deriveDeskRoster,
  deriveRosterPeople,
  groupRosterByPerson,
  motionAnchorDate,
  OPEN_THE_JOB,
  ROSTER_STAGE_ORDER,
  rosterLineNeedsAHand,
  sentProposalReasonLine,
  sentProposalSignedLine,
  sentProposalStandingLine,
  type DeskRosterInput,
  type RosterMember,
} from '@/lib/document/desk-roster-derivation';

const NOW = new Date('2026-08-25T12:00:00Z');

function row(
  id: string,
  section: SectionKey,
  over: Partial<DocumentStateRow> = {},
): DocumentStateRow {
  return {
    engagement_id: id,
    title: `${id} residence`,
    client_name: `Family ${id}`,
    active_section: section,
    current_phase: null,
    updated_at: '2026-08-01T00:00:00Z',
    ...over,
  } as unknown as DocumentStateRow;
}

function need(over: Partial<NeedLine> = {}): NeedLine {
  return {
    kind: 'task_due' as NeedKind,
    text: 'A task is due',
    actionLabel: 'Open the task',
    stamp: { label: 'DUE', color: 'var(--color-clay)' },
    urgent: false,
    ...over,
  } as NeedLine;
}

function folder(r: DocumentStateRow, n: NeedLine = need()): DeskFolder {
  return { row: r, need: n } as DeskFolder;
}

function chip(r: DocumentStateRow, text: string): MotionChip {
  return { row: r, kind: 'on_the_way', text } as unknown as MotionChip;
}

function input(over: Partial<DeskRosterInput> = {}): DeskRosterInput {
  return { folders: [], chips: [], live: [], ...over };
}

describe('deriveDeskRoster — grouping', () => {
  it('groups every live job by its active section', () => {
    const a = row('a', 'project');
    const b = row('b', 'project');
    const c = row('c', 'care');
    const roster = deriveDeskRoster(input({ live: [a, b, c] }), NOW);

    expect(roster.groups.map((g) => g.key)).toEqual(['project', 'care']);
    expect(roster.groups[0].lines.map((l) => l.engagementId)).toEqual([
      'a',
      'b',
    ]);
    expect(roster.groups[0].count).toBe(2);
    expect(roster.groups[1].lines.map((l) => l.engagementId)).toEqual(['c']);
  });

  it('orders the groups by the paper’s own section order', () => {
    const live = [...ROSTER_STAGE_ORDER]
      .reverse()
      .map((stage) => row(stage, stage));
    const roster = deriveDeskRoster(input({ live }), NOW);

    expect(roster.groups.map((g) => g.key)).toEqual([...ROSTER_STAGE_ORDER]);
  });

  it('leaves an empty stage unprinted', () => {
    const roster = deriveDeskRoster(
      input({ live: [row('only', 'install')] }),
      NOW,
    );

    expect(roster.groups).toHaveLength(1);
    expect(roster.groups[0].key).toBe('install');
  });
});

describe('deriveDeskRoster — order within a group', () => {
  it('puts red-letter first, then oldest', () => {
    const quietNew = row('quiet-new', 'project', {
      updated_at: '2026-08-20T00:00:00Z',
    });
    const quietOld = row('quiet-old', 'project', {
      updated_at: '2026-06-01T00:00:00Z',
    });
    const lateSoft = row('late-soft', 'project');
    const lateHard = row('late-hard', 'project');

    const roster = deriveDeskRoster(
      input({
        live: [quietNew, lateSoft, quietOld, lateHard],
        folders: [
          folder(lateSoft, need({ dueOn: '2026-08-20' })),
          folder(lateHard, need({ dueOn: '2026-07-01' })),
        ],
      }),
      NOW,
    );

    expect(roster.groups[0].lines.map((l) => l.engagementId)).toEqual([
      'late-hard',
      'late-soft',
      'quiet-old',
      'quiet-new',
    ]);
  });
});

describe('deriveDeskRoster — the header and the overdue line', () => {
  it('counts every live job and every overdue one', () => {
    const one = row('one', 'project');
    const two = row('two', 'proposal');
    const three = row('three', 'care');
    const roster = deriveDeskRoster(
      input({
        live: [one, two, three],
        folders: [folder(one, need({ dueOn: '2026-08-01' }))],
      }),
      NOW,
    );

    expect(roster.heading).toBe('Every job · 3 live · 1 overdue');
    expect(roster.liveCount).toBe(3);
    expect(roster.overdueCount).toBe(1);
  });

  it('names what is overdue in one line', () => {
    const vandersteen = row('v', 'project', {
      client_name: 'Anne Vandersteen',
    });
    const byrne = row('b', 'proposal', { client_name: 'Erin Byrne' });
    const roster = deriveDeskRoster(
      input({
        live: [vandersteen, byrne],
        folders: [
          folder(vandersteen, need({ dueOn: '2026-08-19' })),
          folder(byrne, need({ dueOn: '2026-08-19' })),
        ],
      }),
      NOW,
    );

    expect(roster.overdueLine).toBe(
      'Two things are overdue — Byrne and Vandersteen.',
    );
  });

  it('says so plainly when nothing is overdue', () => {
    const roster = deriveDeskRoster(
      input({ live: [row('a', 'project')] }),
      NOW,
    );

    expect(roster.overdueLine).toBe('Nothing is overdue.');
  });
});

describe('deriveDeskRoster — the line', () => {
  it('reads place, phase and state in one run', () => {
    const r = row('a', 'project', {
      client_name: 'The Vandersteens',
      current_phase: 'procurement_and_orders',
    });
    const roster = deriveDeskRoster(
      input({ live: [r], folders: [folder(r, need({ text: 'A task is due' }))] }),
      NOW,
    );

    expect(roster.groups[0].lines[0].state).toBe(
      'The Vandersteens · Procurement And Orders · A task is due',
    );
  });

  it('counts only what it prints, so the header can never over-claim', () => {
    // A row whose active_section falls outside ROSTER_STAGE_ORDER would be
    // printed under no heading; counting it would have the header claim more
    // jobs than the roster shows.
    const stray = row('x', 'nowhere' as SectionKey);
    const roster = deriveDeskRoster(
      input({ live: [row('a', 'project'), stray] }),
      NOW,
    );

    expect(roster.liveCount).toBe(1);
    expect(roster.heading).toBe('Every job · 1 live · 0 overdue');
  });

  it('carries the motion when there is no need, and says so when there is neither', () => {
    const moving = row('m', 'install');
    const quiet = row('q', 'care', { client_name: '' });
    const roster = deriveDeskRoster(
      input({ live: [moving, quiet], chips: [chip(moving, 'punch list open')] }),
      NOW,
    );

    expect(roster.groups[0].lines[0].state).toBe('Family m · punch list open');
    expect(roster.groups[1].lines[0].state).toBe(
      'No current alert',
    );
  });

  it('gives a job with no act of its own the act of opening it', () => {
    const r = row('a', 'project');
    const roster = deriveDeskRoster(input({ live: [r] }), NOW);

    expect(roster.groups[0].lines[0].act).toEqual({
      label: OPEN_THE_JOB,
      href: '/doc/a',
    });
    expect(roster.groups[0].lines[0].jobHref).toBe('/doc/a');
  });

  it('carries the job’s own act, and its ledger where the act is one', () => {
    const r = row('a', 'project');
    const roster = deriveDeskRoster(
      input({
        live: [r],
        folders: [
          folder(
            r,
            need({
              kind: 'overdue_invoice',
              text: 'Invoice 1042 overdue — oldest due Aug 2 — send a reminder',
              actionLabel: 'Send reminder',
              dueOn: '2026-08-02',
              ledger: {
                name: 'accounts',
                context: { page: 'receivables', invoiceId: 'inv-1' },
              },
            }),
          ),
        ],
      }),
      NOW,
    );

    const line = roster.groups[0].lines[0];
    expect(line.act.label).toBe('Send reminder');
    expect(line.act.ledger).toEqual({
      name: 'accounts',
      context: { page: 'receivables', invoiceId: 'inv-1' },
    });
    expect(line.overdueText).toBe(
      'Overdue 23 days — Invoice 1042 overdue — oldest due Aug 2 — send a reminder',
    );
  });

  // B2-03 (re-verified for B3-L3): the roster carries whatever `need.text`
  // says, and desk-derivation.ts's `needOverdueInvoice` puts the dollar
  // figure and (via `overdueElapsedPhrase`) the age directly on that text —
  // so a real overdue-invoice folder card's figure reaches the roster line
  // with no roster-side reformatting.
  it('carries the receivable’s dollar figure and its age onto the roster line', () => {
    const r = row('a', 'project');
    const roster = deriveDeskRoster(
      input({
        live: [r],
        folders: [
          folder(
            r,
            need({
              kind: 'overdue_invoice',
              text: 'Invoice 0418 · $17,500 overdue — oldest due Aug 3 — send a reminder',
              actionLabel: 'Send reminder',
              dueOn: '2026-08-03',
            }),
          ),
        ],
      }),
      NOW,
    );

    const line = roster.groups[0].lines[0];
    expect(line.mark).toBe('urgent');
    expect(line.overdueText).toContain('$17,500');
    expect(line.overdueText).toMatch(/^Overdue \d+ days? —/);
  });

  it('marks a dated overdue item and a setup chore differently', () => {
    const late = row('late', 'project');
    const setup = row('setup', 'project');
    const roster = deriveDeskRoster(
      input({
        live: [late, setup],
        folders: [
          folder(late, need({ dueOn: '2026-08-01' })),
          folder(
            setup,
            need({
              kind: 'schedule_unconfigured',
              text: 'The schedule has no phases yet',
              actionLabel: 'Open the schedule',
              dueOn: null,
            }),
          ),
        ],
      }),
      NOW,
    );

    const marks = Object.fromEntries(
      roster.groups[0].lines.map((l) => [l.engagementId, l.mark]),
    );
    expect(marks).toEqual({ late: 'urgent', setup: 'quiet' });
  });

  it('marks EVERY need, dated or not, and nothing that has none', () => {
    // §2.1: "Needs are a red-letter mark on the job's line." A damage claim
    // and a flagged proposal carry no due date and were left unmarked, so a
    // studio's whole open workload could read as an unmarked roster.
    const claim = row('claim', 'project');
    const flagged = row('flagged', 'proposal');
    const idle = row('idle', 'care');
    const roster = deriveDeskRoster(
      input({
        live: [claim, flagged, idle],
        folders: [
          folder(claim, need({ kind: 'damage_claim', dueOn: null })),
          folder(flagged, need({ kind: 'hesitating_proposal', dueOn: null })),
        ],
      }),
      NOW,
    );

    const marks = Object.fromEntries(
      roster.groups.flatMap((g) => g.lines).map((l) => [l.engagementId, l.mark]),
    );
    expect(marks).toEqual({ claim: 'urgent', flagged: 'quiet', idle: null });
  });

  it('says a paused job is paused rather than calling it quiet', () => {
    const paused = row('p', 'project', { is_paused: true });
    const roster = deriveDeskRoster(input({ live: [paused] }), NOW);

    expect(roster.groups[0].lines[0].state).toContain('On hold');
    expect(roster.groups[0].lines[0].state).not.toContain('nothing needs your hand');
  });

  it('drops a placeholder client name the way the folder tab does', () => {
    // The seed's placeholder is the two-word `Client User`; a whole-string test
    // let it through onto the line as if it were a family name.
    const seeded = row('s', 'project', { client_name: 'Client User' });
    const real = row('r', 'project', { client_name: 'Anne Vandersteen' });
    const roster = deriveDeskRoster(input({ live: [seeded, real] }), NOW);

    const states = Object.fromEntries(
      roster.groups[0].lines.map((l) => [l.engagementId, l.state]),
    );
    expect(states.s).not.toContain('Client User');
    expect(states.r).toContain('Anne Vandersteen');
  });
});

describe('deriveDeskRoster — one clock per tier', () => {
  it('orders quiet jobs by when they were last touched, never by a future due date', () => {
    // A promise date and a last-touched stamp are two clocks. Compared against
    // each other, a job with a real need due in December sorted behind a quiet
    // one last touched in August.
    const quietOld = row('quiet-old', 'project', {
      updated_at: '2026-06-01T00:00:00Z',
    });
    const needsFuture = row('needs-future', 'project', {
      updated_at: '2026-08-24T00:00:00Z',
    });
    const roster = deriveDeskRoster(
      input({
        live: [needsFuture, quietOld],
        folders: [folder(needsFuture, need({ dueOn: '2026-12-01' }))],
      }),
      NOW,
    );

    expect(roster.groups[0].lines.map((l) => l.engagementId)).toEqual([
      'quiet-old',
      'needs-future',
    ]);
  });

  it('names what is overdue in pressure order, not in stage order', () => {
    // M1 prints `Vandersteen and Byrne` — the older promise first — while the
    // paper's stage order puts every proposal ahead of every project.
    const vandersteen = row('v', 'project', { client_name: 'Anne Vandersteen' });
    const byrne = row('b', 'proposal', { client_name: 'Erin Byrne' });
    const roster = deriveDeskRoster(
      input({
        live: [byrne, vandersteen],
        folders: [
          folder(vandersteen, need({ dueOn: '2026-08-01' })),
          folder(byrne, need({ dueOn: '2026-08-19' })),
        ],
      }),
      NOW,
    );

    expect(roster.overdueLine).toBe(
      'Two things are overdue — Vandersteen and Byrne.',
    );
  });
});

describe('deriveDeskRoster — eleven jobs', () => {
  it('prints one line each, under the stages they stand in', () => {
    const stages: SectionKey[] = [
      'brief',
      'brief',
      'discovery',
      'direction',
      'proposal',
      'proposal',
      'project',
      'project',
      'project',
      'install',
      'care',
    ];
    const live = stages.map((stage, index) => row(`job-${index}`, stage));
    const roster = deriveDeskRoster(input({ live }), NOW);

    const lines = roster.groups.flatMap((g) => g.lines);
    expect(lines).toHaveLength(11);
    expect(new Set(lines.map((l) => l.engagementId)).size).toBe(11);
    expect(roster.liveCount).toBe(11);
    expect(roster.groups.map((g) => [g.key, g.count])).toEqual([
      ['brief', 2],
      ['discovery', 1],
      ['direction', 1],
      ['proposal', 2],
      ['project', 3],
      ['install', 1],
      ['care', 1],
    ]);
  });

  it('prints jobs the two derived populations drop — a capped chip list never shortens the roster', () => {
    const live = Array.from({ length: 11 }, (_, i) => row(`job-${i}`, 'project'));
    const roster = deriveDeskRoster(
      input({ live, folders: [], chips: live.slice(0, 6).map((r) => chip(r, 'moving')) }),
      NOW,
    );

    expect(roster.groups[0].lines).toHaveLength(11);
    expect(roster.heading).toBe('Every job · 11 live · 0 overdue');
  });
});

describe('the roster line carries its stage and its designer', () => {
  it('writes the job’s own section and designer_id onto the line', () => {
    const r = deriveDeskRoster(
      input({
        live: [
          row('a', 'install', { designer_id: 'user-anneke' }),
          row('b', 'brief', { designer_id: null }),
        ],
      }),
      NOW,
    );

    const lines = r.groups.flatMap((g) => g.lines);
    expect(
      lines.map((l) => [l.engagementId, l.stage, l.designerId]),
    ).toEqual([
      ['b', 'brief', null],
      ['a', 'install', 'user-anneke'],
    ]);
  });
});

describe('deriveRosterPeople (IA-12)', () => {
  function member(over: Partial<RosterMember> = {}): RosterMember {
    return {
      user_id: 'user-leah',
      role: 'owner',
      status: 'active',
      profiles: { full_name: 'Leah Hartwell', display_name: null },
      ...over,
    };
  }

  it('puts the principal first and the rest in alphabetical order', () => {
    const people = deriveRosterPeople([
      member({
        user_id: 'c',
        role: 'member',
        profiles: { full_name: 'Colin Brandt', display_name: null },
      }),
      member({
        user_id: 'a',
        role: 'member',
        profiles: { full_name: 'Anneke Sund', display_name: null },
      }),
      member(),
    ]);

    expect(people.map((p) => p.name)).toEqual([
      'Leah Hartwell',
      'Anneke Sund',
      'Colin Brandt',
    ]);
    expect(people.map((p) => p.isPrincipal)).toEqual([true, false, false]);
  });

  it('falls back to the display name, and leaves an unnamed member out', () => {
    const people = deriveRosterPeople([
      member({
        user_id: 'd',
        role: 'member',
        profiles: { full_name: null, display_name: 'Dana' },
      }),
      member({
        user_id: 'e',
        role: 'member',
        profiles: { full_name: null, display_name: null },
      }),
      member({ user_id: 'f', role: 'member', profiles: null }),
    ]);

    expect(people.map((p) => p.name)).toEqual(['Dana']);
  });

  it('leaves out a member who has left the studio', () => {
    const people = deriveRosterPeople([
      member({
        user_id: 'g',
        role: 'member',
        status: 'removed',
        profiles: { full_name: 'Gone Away', display_name: null },
      }),
      member(),
    ]);

    expect(people.map((p) => p.name)).toEqual(['Leah Hartwell']);
  });
});

describe('groupRosterByPerson (IA-12)', () => {
  const PEOPLE = [
    { id: 'leah', name: 'Leah Hartwell', isPrincipal: true },
    { id: 'anneke', name: 'Anneke Sund', isPrincipal: false },
  ];

  function grouped(live: DocumentStateRow[]) {
    return groupRosterByPerson(
      deriveDeskRoster(input({ live }), NOW).groups,
      PEOPLE,
    );
  }

  it('groups the roster by designer_id, principal first', () => {
    const groups = grouped([
      row('a', 'project', { designer_id: 'anneke' }),
      row('b', 'install', { designer_id: 'leah' }),
    ]);

    expect(groups.map((g) => [g.key, g.label, g.count])).toEqual([
      ['person-leah', 'Leah Hartwell', 1],
      ['person-anneke', 'Anneke Sund', 1],
    ]);
    expect(groups[0].lines.map((l) => l.engagementId)).toEqual(['b']);
  });

  it('puts an unassigned row under the principal', () => {
    const groups = grouped([row('a', 'project', { designer_id: null })]);

    expect(groups.map((g) => g.label)).toEqual(['Leah Hartwell']);
    expect(groups[0].lines.map((l) => l.engagementId)).toEqual(['a']);
  });

  it('never loses a row whose designer is nobody on the list', () => {
    const groups = grouped([row('a', 'project', { designer_id: 'stranger' })]);

    expect(groups.map((g) => g.label)).toEqual(['Leah Hartwell']);
    expect(groups[0].count).toBe(1);
  });

  it('prints no plate for a person carrying nothing', () => {
    const groups = grouped([row('a', 'project', { designer_id: 'leah' })]);
    expect(groups.map((g) => g.label)).toEqual(['Leah Hartwell']);
  });

  it('groups nothing when the studio has no one to name', () => {
    expect(
      groupRosterByPerson(
        deriveDeskRoster(input({ live: [row('a', 'project')] }), NOW).groups,
        [],
      ),
    ).toEqual([]);
  });

  it('keeps every live row: the person groups total the roster’s own count', () => {
    const r = deriveDeskRoster(
      input({
        live: [
          row('a', 'project', { designer_id: 'anneke' }),
          row('b', 'install', { designer_id: null }),
          row('c', 'brief', { designer_id: 'stranger' }),
        ],
      }),
      NOW,
    );
    const groups = groupRosterByPerson(r.groups, PEOPLE);

    expect(groups.reduce((n, g) => n + g.count, 0)).toBe(r.liveCount);
  });
});

describe('D6 · custodyWord — whose hand, in words', () => {
  it('says Action with you for the studio’s own need', () => {
    expect(custodyWord(need({ owner: 'designer' }), row('a', 'project'))).toBe(
      'Action with you',
    );
  });

  it('defaults to Action with you when the rule stated no owner at all', () => {
    expect(custodyWord(need({ owner: undefined }), row('a', 'project'))).toBe(
      'Action with you',
    );
    expect(custodyWord(need({ owner: null }), row('a', 'project'))).toBe(
      'Action with you',
    );
  });

  it('names the client by first name where the row carries one', () => {
    const r = row('a', 'project', { client_name: 'Nora Ellison' });
    expect(custodyWord(need({ owner: 'client' }), r)).toBe('Awaiting Nora Ellison');
  });

  it('falls back to Awaiting client where the name is a placeholder', () => {
    // `clientOf` refuses the seed's `Client User` as a family name, and so
    // does this — a role noun never stands in for a name we do not have.
    const r = row('a', 'project', { client_name: 'Client User' });
    expect(custodyWord(need({ owner: 'client' }), r)).toBe('Awaiting client');
  });

  it('falls back to Awaiting client where the row carries no name', () => {
    const r = row('a', 'project', { client_name: null });
    expect(custodyWord(need({ owner: 'client' }), r)).toBe('Awaiting client');
  });

  it('says Awaiting supplier for a vendor-owned need', () => {
    expect(custodyWord(need({ owner: 'maker' }), row('a', 'project'))).toBe(
      'Awaiting supplier',
    );
  });

  it('says No current alert where there is no need at all', () => {
    expect(custodyWord(null, row('a', 'project'))).toBe('No current alert');
  });
});

describe('D6 · deriveDeskRoster writes custody onto every line', () => {
  it('carries the word and the owner on the line itself', () => {
    const claimed = row('claimed', 'project', { client_name: 'Nora Ellison' });
    const quiet = row('quiet', 'project');
    const roster = deriveDeskRoster(
      input({
        live: [claimed, quiet],
        folders: [folder(claimed, need({ owner: 'client' }))],
      }),
      NOW,
    );
    const lines = roster.groups[0].lines;

    expect(lines.find((l) => l.engagementId === 'claimed')!.custody).toBe(
      'Awaiting Nora Ellison',
    );
    expect(lines.find((l) => l.engagementId === 'claimed')!.needOwner).toBe(
      'client',
    );
    expect(lines.find((l) => l.engagementId === 'quiet')!.custody).toBe('No current alert');
    expect(lines.find((l) => l.engagementId === 'quiet')!.needOwner).toBeNull();
  });
});

describe('D8 · the ledger’s date column reads the in-motion state’s own date', () => {
  const dated = (kind: MotionKind, over: Partial<DocumentStateRow>) =>
    ({ row: row('m', 'project', over), kind, text: 'x' }) as unknown as MotionChip;

  // Controller ruling (Task 3): with_client reads proposal_sent_at ONLY, never
  // proposal_last_opened_at — the chip's own prose already reads "With client
  // since <sent date>", and the value column must print the same date the
  // sentence names.
  it('reads the send date for a proposal with the client, even once opened', () => {
    expect(
      motionAnchorDate(
        dated('with_client', {
          proposal_sent_at: '2026-08-04T00:00:00Z',
          proposal_last_opened_at: '2026-08-12T00:00:00Z',
        }),
      ),
    ).toBe('2026-08-04T00:00:00Z');
    expect(
      motionAnchorDate(
        dated('with_client', { proposal_sent_at: '2026-08-04T00:00:00Z' }),
      ),
    ).toBe('2026-08-04T00:00:00Z');
  });

  it('reads the send date for a sent, unopened proposal', () => {
    expect(
      motionAnchorDate(
        dated('sent_unopened', { proposal_sent_at: '2026-08-04T00:00:00Z' }),
      ),
    ).toBe('2026-08-04T00:00:00Z');
  });

  it('reads the last touch for a cold draft, falling back to updated_at', () => {
    expect(
      motionAnchorDate(
        dated('drafting', { proposal_updated_at: '2026-08-06T00:00:00Z' }),
      ),
    ).toBe('2026-08-06T00:00:00Z');
    expect(
      motionAnchorDate(
        dated('drafting', {
          proposal_updated_at: null,
          updated_at: '2026-08-02T00:00:00Z',
        }),
      ),
    ).toBe('2026-08-02T00:00:00Z');
  });

  it.each([
    'paused',
    'in_discovery',
    'in_flight',
    'drift',
    'schedule_position',
    'discovery_scheduled',
    'slots_stale',
    'intro_nudge',
    'intro_sent',
  ] as const)('states no date for %s', (kind) => {
    expect(motionAnchorDate(dated(kind, {}))).toBeNull();
  });

  it('states no date with no chip at all', () => {
    expect(motionAnchorDate(null)).toBeNull();
  });
});

describe('D8 · deriveDeskRoster writes the value and the motion sentence', () => {
  it('prefers the need’s own date, in the surface’s one date style', () => {
    const dated = row('dated', 'project');
    const roster = deriveDeskRoster(
      input({ live: [dated], folders: [folder(dated, need({ dueOn: '2026-08-12' }))] }),
      NOW,
    );

    // dayMonth's own idiom is the long month name ("11 September" —
    // dates.ts / dates.test.ts), not the three-letter abbreviation.
    expect(roster.groups[0].lines[0].valueText).toBe('12 August');
  });

  it('falls to the in-motion date, and carries the chip’s own sentence', () => {
    // Noon UTC, matching this file's own NOW convention — a midnight-UTC
    // timestamp reads back a day early once `dayMonth` formats it in a
    // negative-offset local timezone (the exact trap desk-derivation.ts's
    // `fmtDay` comment names).
    const moving = row('moving', 'project', {
      proposal_sent_at: '2026-08-04T12:00:00Z',
    });
    const roster = deriveDeskRoster(
      input({
        live: [moving],
        chips: [
          {
            row: moving,
            kind: 'with_client',
            text: 'With client since 4 Aug',
          } as unknown as MotionChip,
        ],
      }),
      NOW,
    );

    expect(roster.groups[0].lines[0].valueText).toBe('4 August');
    expect(roster.groups[0].lines[0].motionText).toBe('With client since 4 Aug');
  });

  it('leaves the cell empty for a job that is neither needed nor moving', () => {
    const roster = deriveDeskRoster(input({ live: [row('still', 'project')] }), NOW);

    expect(roster.groups[0].lines[0].valueText).toBeNull();
    expect(roster.groups[0].lines[0].motionText).toBeNull();
  });

  // dates.ts's house rule: the year is spelled out only once it is not this
  // year — `today.getFullYear() !== date.getFullYear() ? legalDate(date) :
  // dayMonth(date)`. NOW is 2026-08-25, so a prior-year due date must carry
  // its year and a current-year one must not.
  it('spells the year out for a due date from a prior year (the house rule)', () => {
    const dated = row('dated-prior-year', 'project');
    const roster = deriveDeskRoster(
      input({ live: [dated], folders: [folder(dated, need({ dueOn: '2025-08-12' }))] }),
      NOW,
    );

    expect(roster.groups[0].lines[0].valueText).toBe('12 August 2025');
  });

  it('omits the year for a due date within this year', () => {
    const dated = row('dated-this-year', 'project');
    const roster = deriveDeskRoster(
      input({ live: [dated], folders: [folder(dated, need({ dueOn: '2026-08-12' }))] }),
      NOW,
    );

    expect(roster.groups[0].lines[0].valueText).toBe('12 August');
  });
});

describe('D5 · a claim takes a card, a quiet job takes a line', () => {
  function claimsOf(over: Partial<DeskRosterInput> = {}) {
    return deriveDeskClaims({
      roster: deriveDeskRoster(input(over), NOW),
      now: NOW,
    });
  }

  it('cards every marked line and leaves every unmarked one in the ledger', () => {
    const claimed = row('claimed', 'project');
    const quietA = row('quiet-a', 'project');
    const quietB = row('quiet-b', 'care');
    const result = claimsOf({
      live: [claimed, quietA, quietB],
      folders: [folder(claimed)],
    });

    expect(result.cards.map((c) => c.line.engagementId)).toEqual(['claimed']);
    expect(result.ledger.map((g) => g.key)).toEqual(['project', 'care']);
    expect(result.ledger[0].lines.map((l) => l.engagementId)).toEqual(['quiet-a']);
    expect(result.ledger[0].count).toBe(1);
  });

  it('drops a stage group the split emptied', () => {
    const claimed = row('claimed', 'project');
    expect(claimsOf({ live: [claimed], folders: [folder(claimed)] }).ledger).toEqual([]);
  });

  it('keeps the roster’s own heading, and counts the ledger head', () => {
    const claimed = row('claimed', 'project');
    const quiet = row('quiet', 'project');
    const result = claimsOf({ live: [claimed, quiet], folders: [folder(claimed)] });

    expect(result.heading).toBe('Every job · 2 live · 0 overdue');
    expect(result.restHeading).toBe('No current alert · 1 job');
  });

  it('pluralises the ledger head, and says nothing over an empty ledger', () => {
    const a = row('a', 'project');
    const b = row('b', 'project');
    expect(claimsOf({ live: [a, b] }).restHeading).toBe('No current alert · 2 jobs');
    expect(claimsOf({ live: [] }).restHeading).toBe('');
  });

  it('keeps the ledger under the paper’s own stage order (D8)', () => {
    const live = [...ROSTER_STAGE_ORDER].reverse().map((s) => row(s, s));
    const result = claimsOf({ live });

    expect(result.ledger.map((g) => g.key)).toEqual([...ROSTER_STAGE_ORDER]);
    expect(result.cards).toEqual([]);
  });
});

describe('N2 · the cards rank by the band’s Next order, then name', () => {
  function claimsOf(over: Partial<DeskRosterInput> = {}) {
    return deriveDeskClaims({
      roster: deriveDeskRoster(input(over), NOW),
      now: NOW,
    });
  }

  it('ranks class, then deadline, then age — never by whose hand the need is in', () => {
    // claimBand put the designer's own lines first and the maker's last. The
    // band's order puts the client's overdue invoice (class 1) first, and a
    // maker silence 12 days old above an undated Pulse and the setup chore
    // the designer holds (class 3).
    const setup = row('a-setup', 'project', { title: 'A setup' });
    const pulse = row('b-pulse', 'project', { title: 'B pulse' });
    const maker = row('c-maker', 'project', { title: 'C maker silence' });
    const late = row('d-late', 'project', { title: 'D overdue task' });
    const invoice = row('e-invoice', 'project', { title: 'E invoice' });
    const result = claimsOf({
      live: [setup, pulse, maker, late, invoice],
      folders: [
        folder(setup, need({ kind: 'schedule_unconfigured', owner: 'designer' })),
        folder(pulse, need({ kind: 'pulse_due', owner: 'designer' })),
        folder(
          maker,
          need({
            kind: 'po_unacknowledged',
            owner: 'maker',
            text: 'PO-HD-0412 sent — no acknowledgment',
            dueOn: '2026-08-13T10:00:00Z',
            at: '2026-08-13T10:00:00Z',
          }),
        ),
        folder(late, need({ owner: 'designer', dueOn: '2026-08-01' })),
        folder(invoice, need({ kind: 'overdue_invoice', owner: 'client', dueOn: '2026-08-15' })),
      ],
    });

    expect(result.cards.map((c) => c.line.engagementId)).toEqual([
      'e-invoice',
      'd-late',
      'c-maker',
      'b-pulse',
      'a-setup',
    ]);
  });

  it('puts the older of two silences first', () => {
    const fresh = row('a-fresh', 'project', { title: 'A fresh' });
    const stale = row('b-stale', 'project', { title: 'B stale' });
    const silence = (at: string) =>
      need({ kind: 'po_unacknowledged', owner: 'maker', text: 'A purchase order sent — no acknowledgment', dueOn: at, at });
    const result = claimsOf({
      live: [fresh, stale],
      folders: [folder(fresh, silence('2026-08-21')), folder(stale, silence('2026-08-13'))],
    });

    expect(result.cards.map((c) => c.line.engagementId)).toEqual(['b-stale', 'a-fresh']);
  });

  it('puts the nearer deadline first inside a class', () => {
    const soon = row('m-soon', 'project', { title: 'M soon' });
    const older = row('a-older', 'project', { title: 'A older' });
    const result = claimsOf({
      live: [soon, older],
      folders: [
        folder(soon, need({ owner: 'designer', dueOn: '2026-09-20' })),
        folder(older, need({ owner: 'designer', dueOn: '2026-09-01' })),
      ],
    });

    expect(result.cards.map((c) => c.line.engagementId)).toEqual([
      'a-older',
      'm-soon',
    ]);
  });

  it('breaks a tie on the name, never on the id', () => {
    // A UUID tiebreak is stable but arbitrary; a name is legible.
    const zed = row('aaa', 'project', { title: 'Zeta house' });
    const ash = row('zzz', 'project', { title: 'Ash house' });
    const result = claimsOf({
      live: [zed, ash],
      folders: [
        folder(zed, need({ owner: 'designer' })),
        folder(ash, need({ owner: 'designer' })),
      ],
    });

    expect(result.cards.map((c) => c.line.name)).toEqual([
      'Ash house',
      'Zeta house',
    ]);
  });

  it('orders two UNDATED same-class cards by name', () => {
    // Both read `none` with no age, so the comparator ties and the name order
    // the cards were handed in stands.
    const zed = row('aaa', 'project', { title: 'Zeta house' });
    const ash = row('zzz', 'project', { title: 'Ash house' });
    const result = claimsOf({
      live: [zed, ash],
      folders: [
        folder(zed, need({ owner: 'designer', dueOn: null })),
        folder(ash, need({ owner: 'designer', dueOn: null })),
      ],
    });

    expect(result.cards.map((c) => c.line.name)).toEqual([
      'Ash house',
      'Zeta house',
    ]);
  });

  it('sorts a dated card ahead of an undated one in the same class', () => {
    const dated = row('dated', 'project', { title: 'Zeta house' });
    const undated = row('undated', 'project', { title: 'Ash house' });
    const result = claimsOf({
      live: [dated, undated],
      folders: [
        folder(dated, need({ owner: 'designer', dueOn: '2026-09-01' })),
        folder(undated, need({ owner: 'designer', dueOn: null })),
      ],
    });

    expect(result.cards.map((c) => c.line.engagementId)).toEqual([
      'dated',
      'undated',
    ]);
  });

  it('carries the stage and its sentence-case label on the card', () => {
    const mine = row('mine', 'project');
    const result = claimsOf({ live: [mine], folders: [folder(mine)] });

    expect(result.cards[0].stage).toBe('project');
    expect(result.cards[0].stageLabel).toBe('Project delivery');
    expect(result.cards[0].custody).toBe('Action with you');
  });
});

describe('deriveDeskRoster — personLine (the line under the name)', () => {
  it('joins the client and the phase, and never the body text', () => {
    const r = row('a', 'project', {
      client_name: 'The Vandersteens',
      current_phase: 'procurement_and_orders',
    });
    const roster = deriveDeskRoster(
      input({ live: [r], folders: [folder(r, need({ text: 'A task is due' }))] }),
      NOW,
    );

    expect(roster.groups[0].lines[0].personLine).toBe(
      'The Vandersteens · Procurement And Orders',
    );
  });

  it('omits a client that is the job’s own name (case and space insensitive)', () => {
    const r = row('a', 'project', {
      title: 'Priya Raman',
      client_name: '  priya raman ',
      current_phase: 'discovery',
    });
    const roster = deriveDeskRoster(input({ live: [r] }), NOW);

    expect(roster.groups[0].lines[0].personLine).toBe('Discovery');
  });

  it('is empty where the job has neither a nameable client nor a phase', () => {
    const r = row('a', 'project', { client_name: '', current_phase: null });
    const roster = deriveDeskRoster(input({ live: [r] }), NOW);

    expect(roster.groups[0].lines[0].personLine).toBe('');
  });

  it('never carries the at-rest sentence the ledger’s own cell owns', () => {
    const r = row('a', 'project', { client_name: 'Erin Byrne' });
    const roster = deriveDeskRoster(input({ live: [r] }), NOW);
    const line = roster.groups[0].lines[0];

    expect(line.personLine).toBe('Erin Byrne');
    expect(line.personLine).not.toContain('nothing needs your hand');
  });

  // US-19 FR3 F3-12 / F3-13 (`one-voice`) — the card printed
  // `Nora Ellison · Installation` and the seed's no-login suffix.
  it('one-voice: prints the stage word where the workflow word printed, and no no-login suffix', () => {
    const install = row('a', 'install', {
      title: 'Cedar Lane Study',
      client_name: 'Nora Ellison',
      current_phase: 'installation',
    });
    const line = deriveDeskRoster(input({ live: [install], oneVoice: true }), NOW).groups[0]
      .lines[0];
    expect(line.personLine).toBe('Nora Ellison · Install');
    expect(line.state).toMatch(/^Nora Ellison · Install · /);
    expect(line.state).not.toContain('Installation');

    const noLogin = row('b', 'direction', {
      client_name: 'Elena Marlowe (no-login household)',
    });
    const voiced = deriveDeskRoster(input({ live: [noLogin], oneVoice: true }), NOW).groups[0]
      .lines[0];
    expect(voiced.personLine).toBe('Elena Marlowe');
    expect(voiced.client).toBe('Elena Marlowe');
  });

  it('one-voice: a phase-less card stays phase-less (label only)', () => {
    const lead = row('a', 'brief', { client_name: 'Marcus Wright', current_phase: null });
    const line = deriveDeskRoster(input({ live: [lead], oneVoice: true }), NOW).groups[0]
      .lines[0];
    expect(line.personLine).toBe('Marcus Wright');
  });

  it('flag off: the phase and the client print as they always have', () => {
    const install = row('a', 'install', {
      client_name: 'Elena Marlowe (no-login household)',
      current_phase: 'installation',
    });
    const line = deriveDeskRoster(input({ live: [install] }), NOW).groups[0].lines[0];
    expect(line.personLine).toBe('Elena Marlowe (no-login household) · Installation');
  });
});

// US-19 FR2 F2-2, 499-9, 506-6, R17 — under `one-voice` the roster (every
// ledger row and claim card prints `line.act.label`, `needText`, `state`,
// `motionText`) speaks each act by its one name. Off, today's strings.
describe('deriveDeskRoster — one voice (FR2 F2-2)', () => {
  const voiced = (r: DocumentStateRow, n: NeedLine) =>
    deriveDeskRoster(input({ live: [r], folders: [folder(r, n)], oneVoice: true }), NOW)
      .groups[0].lines[0];
  const unvoiced = (r: DocumentStateRow, n: NeedLine) =>
    deriveDeskRoster(input({ live: [r], folders: [folder(r, n)] }), NOW).groups[0].lines[0];

  it('kills Record payment, Review decisions and Review the claim', () => {
    const mei = row('aspen', 'project', { client_name: 'Mei Lin' });
    const cases: [NeedLine, string, string][] = [
      [need({ kind: 'payment_due', actionLabel: 'Record payment' }), 'Record payment', 'Record the payment'],
      [need({ kind: 'overdue_decision', actionLabel: 'Review decisions' }), 'Review decisions', 'Nudge Mei'],
      [need({ kind: 'damage_claim', actionLabel: 'Review the claim' }), 'Review the claim', 'File the claim'],
    ];
    for (const [n, before, after] of cases) {
      expect(unvoiced(mei, n).act.label).toBe(before);
      expect(voiced(mei, n).act.label).toBe(after);
    }
  });

  it('labels a held order by its landing control, Approve release', () => {
    const r = row('held', 'project');
    const held = need({ kind: 'po_unsent', actionLabel: 'Release', releaseHeld: true });
    expect(unvoiced(r, held).act.label).toBe('Release');
    expect(voiced(r, held).act.label).toBe('Approve release');
  });

  it('labels a held draft Open the held draft, and a date request names its maker', () => {
    const r = row('cedar', 'install');
    const draft = need({
      kind: 'po_unacknowledged',
      text: 'Arrival date request to the maker drafted',
      actionLabel: 'Review and send',
      draft: {
        id: 'd1',
        kind: 'maker_eta_request',
        status: 'awaiting_review',
        to_email: 'shop@fixture.example',
        subject: 'Arrival date: Side table',
        body: 'When?',
        created_at: '2026-08-20T00:00:00Z',
        maker: 'Fixture Metalworks',
      },
    });
    const off = unvoiced(r, draft);
    expect(off.act.label).toBe('Review and send');
    expect(off.needText).toBe('Arrival date request to the maker drafted');
    const on = voiced(r, draft);
    expect(on.act.label).toBe('Open the held draft');
    expect(on.needText).toBe('Date request to Fixture Metalworks drafted — not sent.');
    expect(on.state).toContain('Date request to Fixture Metalworks drafted — not sent.');
    expect(on.act.label).not.toBe('Follow up with the maker');
  });

  it('never prints the word Band: the unanchored chip yields to pieces on the way, or to nothing', () => {
    const band = (r: DocumentStateRow) =>
      ({ row: r, kind: 'schedule_position', text: 'Band — no anchor yet' }) as MotionChip;
    const birch = row('birch', 'project', { in_flight_count: 0 });
    const marrow = row('marrow', 'project', { in_flight_count: 2 });
    const off = deriveDeskRoster(
      input({ live: [birch, marrow], chips: [band(birch), band(marrow)] }),
      NOW,
    );
    expect(off.groups[0].lines.map((l) => l.motionText)).toEqual([
      'Band — no anchor yet',
      'Band — no anchor yet',
    ]);
    const on = deriveDeskRoster(
      input({ live: [birch, marrow], chips: [band(birch), band(marrow)], oneVoice: true }),
      NOW,
    );
    const byId = new Map(on.groups[0].lines.map((l) => [l.engagementId, l]));
    expect(byId.get('birch')!.motionText).toBeNull();
    expect(byId.get('marrow')!.motionText).toBe('2 pieces on the way');
    for (const line of on.groups[0].lines) expect(line.state).not.toMatch(/\bBand\b/);
  });
});

// US-19 FR3 F3-4 — under `one-voice` the line leads with the band's Next
// (`selectNext`: class 1 → 2 → own act → 3), so the setup row `Name the phases
// for this project · Open the schedule` never outranks a class-2 need. The
// chain's head is `deriveNeeds`' rule order, where setup stands above a PO.
describe('deriveDeskRoster — the lead need is the band’s Next (FR3 F3-4)', () => {
  const setup = need({
    kind: 'schedule_unconfigured',
    text: 'Name the phases for this project',
    actionLabel: 'Open the schedule',
    stamp: { label: 'SETUP', color: 'var(--color-clay)' },
  });
  const chained = (r: DocumentStateRow, needs: NeedLine[], oneVoice: boolean) =>
    deriveDeskRoster(
      input({ live: [r], folders: [{ row: r, need: needs[0], needs } as DeskFolder], oneVoice }),
      NOW,
    ).groups[0].lines[0];

  it('Halloran — the unanswered PO leads: Follow up with the maker', () => {
    const halloran = row('halloran', 'project', { client_name: 'Ruth Halloran' });
    const po = need({
      kind: 'po_unacknowledged',
      text: 'NA-2026-077 sent 6 days ago — no acknowledgment',
      actionLabel: 'Follow up with the maker',
      dueOn: '2026-08-19',
      owner: 'maker',
    });
    const on = chained(halloran, [setup, po], true);
    expect(on.needKind).toBe('po_unacknowledged');
    expect(on.act.label).toBe('Follow up with the maker');
    expect(on.needText).toBe('NA-2026-077 sent 6 days ago — no acknowledgment');
    expect(on.custody).toBe('Awaiting supplier');
    // Flag off, today's head of the chain.
    const off = chained(halloran, [setup, po], false);
    expect(off.needKind).toBe('schedule_unconfigured');
    expect(off.act.label).toBe('Open the schedule');
  });

  it('Cedar — the held date request (class 2) leads the setup row', () => {
    const cedar = row('cedar', 'install');
    const draft = need({
      kind: 'po_unacknowledged',
      text: 'Arrival date request to the maker drafted',
      actionLabel: 'Review and send',
      draft: {
        id: 'd1',
        kind: 'maker_eta_request',
        status: 'awaiting_review',
        to_email: null,
        subject: 'Arrival date: Side table',
        body: 'When?',
        created_at: '2026-08-20T00:00:00Z',
        maker: null,
      },
    });
    const on = chained(cedar, [setup, draft], true);
    expect(on.needKind).toBe('po_unacknowledged');
    expect(on.act.label).toBe('Open the held draft');
    expect(on.needText).toBe('Date request to the maker drafted — not sent.');
    expect(chained(cedar, [setup, draft], false).act.label).toBe('Open the schedule');
  });

  it('class 1 leads class 2, as on the band', () => {
    const r = row('chen', 'project');
    const decision = need({ kind: 'overdue_decision', actionLabel: 'Review decisions' });
    const payment = need({
      kind: 'payment_due',
      text: 'Balance to Woodward & Sons · $3,400 due 12 May — WS-188',
      actionLabel: 'Record payment',
      dueOn: '2026-05-12',
    });
    expect(chained(r, [decision, payment], true).act.label).toBe('Record the payment');
  });

  it('a need with no act is never the lead while one with an act stands', () => {
    const r = row('lead', 'project');
    const silent = need({ kind: 'reconnect_due', text: 'Reconnect by 1 Sept', actionLabel: null });
    const task = need({ kind: 'task_due', actionLabel: 'Open the task' });
    expect(chained(r, [silent, task], true).needKind).toBe('task_due');
  });

  // FR4 ruling 521 (b) — setup never leads a card: a folder whose only needs
  // are setup prints at rest with the Desk's existing `Open the job`.
  it('setup alone prints at rest with Open the job (FR4 521)', () => {
    const cedar = row('cedar', 'install', { client_name: 'Ines Cedar' });
    const on = chained(cedar, [setup], true);
    expect(on.act.label).toBe(OPEN_THE_JOB);
    expect(on.act.href).toBe('/doc/cedar');
    expect(on.needKind).toBeNull();
    expect(on.needText).toBeNull();
    expect(on.mark).toBeNull();
    expect(on.custody).toBe('No current alert');
    expect(on.state).not.toContain('Name the phases for this project');
    expect(rosterLineNeedsAHand(on)).toBe(false);
    // Flag off, today's setup lead.
    const off = chained(cedar, [setup], false);
    expect(off.act.label).toBe('Open the schedule');
    expect(off.needKind).toBe('schedule_unconfigured');
    expect(off.custody).toBe('Action with you');
  });
});

// US-19 FR4 Fix 5 — the Desk card prints the paper's own act where the need
// and the paper name the same moment. Labels and act choice only.
describe('deriveDeskRoster — the card act agrees with the paper (FR4 Fix 5)', () => {
  const line = (r: DocumentStateRow, n: NeedLine, oneVoice: boolean) =>
    deriveDeskRoster(input({ live: [r], folders: [folder(r, n)], oneVoice }), NOW).groups[0]
      .lines[0];

  const newLead = need({
    kind: 'new_lead',
    text: 'New lead — respond by Aug 27',
    actionLabel: null,
    dueOn: '2026-08-27T00:00:00Z',
    owner: 'designer',
  });

  it('a Brief card with an open inquiry prints Respond to the inquiry; the reason line stays', () => {
    const wright = row('wright', 'brief', { engagement_kind: 'lead', lead_status: 'new' });
    const on = line(wright, newLead, true);
    expect(on.act.label).toBe('Respond to the inquiry');
    expect(on.act.href).toBe('/doc/wright');
    expect(on.needText).toBe('New lead — respond by Aug 27');
    expect(on.needKind).toBe('new_lead');
    const off = line(wright, newLead, false);
    expect(off.act.label).toBe(OPEN_THE_JOB);
    expect(off.needText).toBe('New lead — respond by Aug 27');
  });

  const unopened = need({
    kind: 'hesitating_proposal',
    text: 'Sent 5 October — not yet opened',
    actionLabel: 'Follow up',
    owner: 'client',
  });
  // FR7 F7-3 — the Nudge is the Message composer, so its rows carry the
  // client's login (`client_profile_id`).
  const sent = (id: string, client_name: string, over: Partial<DocumentStateRow> = {}) =>
    row(id, 'proposal', {
      client_name,
      client_profile_id: `client-${id}`,
      proposal_status: 'sent',
      proposal_sent_at: '2026-08-20T00:00:00Z',
      proposal_viewed_at: null,
      ...over,
    });

  it('a proposal with the client, not yet opened, prints Nudge {first}', () => {
    const aspen = sent('aspen', 'Mei Lin');
    const on = line(aspen, unopened, true);
    expect(on.act.label).toBe('Nudge Mei');
    expect(on.act.href).toBe('/doc/aspen');
    expect(on.needText).toBe('Sent 5 October — not yet opened');
    expect(line(aspen, unopened, false).act.label).toBe('Follow up');
  });

  it('the generic Client User is no name: Nudge the client', () => {
    const aspen = sent('aspen', 'Client User');
    expect(line(aspen, unopened, true).act.label).toBe('Nudge the client');
    expect(line(sent('blank', ''), unopened, true).act.label).toBe('Nudge the client');
    expect(line(aspen, unopened, false).act.label).toBe('Follow up');
  });

  // FR5 531-1 (Fix F5-4) — the paper maps `viewed` to `sent`, so an opened,
  // unsigned proposal's card prints the same Nudge; the reason line stays.
  it('a proposal opened and unsigned prints Nudge {first} / Nudge the client (FR5 F5-4)', () => {
    const opened = (client_name: string) =>
      sent('opened', client_name, {
        proposal_status: 'viewed',
        proposal_viewed_at: '2026-08-21T00:00:00Z',
      });
    const hesitating = need({
      kind: 'hesitating_proposal',
      text: 'Opened Aug 21 — no signature yet',
      actionLabel: 'Follow up',
      owner: 'client',
    });
    const on = line(opened('Mei Lin'), hesitating, true);
    expect(on.act.label).toBe('Nudge Mei');
    expect(on.act.href).toBe('/doc/opened');
    expect(on.needText).toBe('Opened Aug 21 — no signature yet');
    expect(line(opened('Client User'), hesitating, true).act.label).toBe('Nudge the client');
    // Flag off, today's Follow up.
    expect(line(opened('Mei Lin'), hesitating, false).act.label).toBe('Follow up');
  });

  // FR7 F7-3 (D1) — the card reads the fact it has: with no client login the
  // Message is held, so the card prints the reminder the band prints.
  it('a proposal whose client has no login prints Send a reminder (FR7 F7-3)', () => {
    const noLogin = sent('aspen', 'Mei Lin', { client_profile_id: null });
    const on = line(noLogin, unopened, true);
    expect(on.act.label).toBe('Send a reminder');
    expect(on.act.href).toBe('/doc/aspen');
    expect(on.needText).toBe('Sent 5 October — not yet opened');
    expect(line(noLogin, unopened, false).act.label).toBe('Follow up');
  });
});

// US-19 FR7 F7-2 — inside the hesitation threshold line 2 prints the paper's
// standing fact: the reason line's first clause, its judgment left off.
describe('sentProposalStandingLine (FR7 F7-2)', () => {
  const now = new Date('2026-10-08T12:00:00Z');
  const tanaka = (over: Partial<DocumentStateRow> = {}) =>
    row('tanaka', 'proposal', {
      engagement_kind: 'proposal',
      client_name: 'Mei Tanaka',
      proposal_status: 'sent',
      proposal_sent_at: '2026-10-08T09:00:00Z',
      proposal_viewed_at: null,
      proposal_last_opened_at: null,
      ...over,
    });

  it('sent and unopened: Sent {day}.', () => {
    expect(sentProposalStandingLine(tanaka())).toBe('Sent 8 October.');
    // Inside the threshold the card prints no reason line; the standing fact remains.
    expect(sentProposalReasonLine(tanaka(), now)).toBeNull();
    // Past it, the reason line is the same clause with its judgment.
    const fiveDays = tanaka({ proposal_sent_at: '2026-10-03T12:00:00Z' });
    expect(sentProposalReasonLine(fiveDays, now)).toBe('Sent 3 October — not yet opened');
    expect(sentProposalStandingLine(fiveDays)).toBe('Sent 3 October.');
  });

  it('opened: Opened {day}., from the last open the reason line reads', () => {
    const opened = tanaka({
      proposal_status: 'viewed',
      proposal_viewed_at: '2026-10-07T10:00:00Z',
    });
    expect(sentProposalStandingLine(opened)).toBe('Opened 7 October.');
    expect(
      sentProposalStandingLine({ ...opened, proposal_last_opened_at: '2026-10-08T08:00:00Z' }),
    ).toBe('Opened 8 October.');
  });

  it('is null when the paper is not out with her', () => {
    expect(sentProposalStandingLine(tanaka({ proposal_status: 'draft' }))).toBeNull();
    expect(sentProposalStandingLine(tanaka({ proposal_status: 'accepted' }))).toBeNull();
    expect(sentProposalStandingLine(tanaka({ proposal_status: null }))).toBeNull();
    // A day that cannot be read is silence, never `Sent .`.
    expect(sentProposalStandingLine(tanaka({ proposal_sent_at: null }))).toBeNull();
  });
});

// US-19 FR8 F8-4 — line 2 beside `Countersign agreement`.
describe('sentProposalSignedLine (FR8 F8-4)', () => {
  it('names the client who signed: Signed by Mei.', () => {
    expect(sentProposalSignedLine('Mei')).toBe('Signed by Mei.');
  });

  it('falls back to the client with no usable name', () => {
    expect(sentProposalSignedLine(null)).toBe('Signed by the client.');
    expect(sentProposalSignedLine('  ')).toBe('Signed by the client.');
  });
});

// ─── US-25 W2 (SQ-744) ────────────────────────────────────────────────────────

describe('fix-now 6 — at rest only when every modelled feed answered', () => {
  const quiet = row('q', 'project');
  const busy = row('b', 'project');

  it('names the unread feeds on the roster and on each job with no need', () => {
    const roster = deriveDeskRoster(
      input({ live: [quiet, busy], folders: [folder(busy)], unreadFeeds: ['invoices', 'deliveries'] }),
      NOW,
    );
    expect(roster.unreadFeeds).toEqual(['invoices', 'deliveries']);
    expect(roster.notChecked).toBe('Not checked: invoices, deliveries.');
    const lines = roster.groups.flatMap((g) => g.lines);
    const q = lines.find((l) => l.engagementId === 'q')!;
    expect(q.notChecked).toBe('Not checked: invoices, deliveries.');
    expect(q.custody).toBe('Not checked');
    expect(q.state).toContain('not checked: invoices, deliveries');
    expect(q.state).not.toContain('no current alert');
    // A job with a need keeps its need.
    expect(lines.find((l) => l.engagementId === 'b')!.notChecked).toBeNull();
    expect(deriveDeskClaims({ roster, now: NOW }).restHeading).toBe('Not checked · 1 job');
  });

  it('every feed answered (absent or empty) is the one state that may print at rest', () => {
    for (const unreadFeeds of [undefined, []]) {
      const roster = deriveDeskRoster(input({ live: [quiet], unreadFeeds }), NOW);
      expect(roster.notChecked).toBeNull();
      const [line] = roster.groups.flatMap((g) => g.lines);
      expect(line.notChecked).toBeNull();
      expect(line.custody).toBe('No current alert');
      expect(line.state).toContain('No current alert');
    }
  });

  it('a paused job says paused, never not checked', () => {
    const paused = row('p', 'project', { is_paused: true });
    const roster = deriveDeskRoster(input({ live: [paused], unreadFeeds: ['invoices'] }), NOW);
    const [line] = roster.groups.flatMap((g) => g.lines);
    expect(line.notChecked).toBeNull();
    expect(line.state).toContain('On hold');
  });
});

describe('N6 — lead cards stand in the order they wrote in', () => {
  it('within one deadline the earlier arrival leads, whatever the name order', () => {
    const due = '2026-08-30T00:00:00Z';
    const aaron = row('a', 'brief', { title: 'Aaron' });
    const zelda = row('z', 'brief', { title: 'Zelda' });
    const roster = deriveDeskRoster(
      input({
        live: [aaron, zelda],
        folders: [
          folder(aaron, need({ kind: 'new_lead', text: 'Aaron wrote — respond', dueOn: due, at: '2026-08-24T00:00:00Z', owner: 'designer' })),
          folder(zelda, need({ kind: 'new_lead', text: 'Zelda wrote — respond', dueOn: due, at: '2026-08-20T00:00:00Z', owner: 'designer' })),
        ],
      }),
      NOW,
    );
    const { cards } = deriveDeskClaims({ roster, now: NOW });
    expect(cards.map((c) => c.line.engagementId)).toEqual(['z', 'a']);
  });
});
