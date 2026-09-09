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
  CLAIMS_ANCHOR_ID,
  custodyWord,
  deriveDeskClaims,
  deriveDeskRoster,
  deriveRosterPeople,
  facetHeading,
  filterRosterToNeeds,
  groupClaimsByPerson,
  groupRosterByPerson,
  motionAnchorDate,
  NOTHING_NEEDS_YOU,
  OPEN_THE_JOB,
  ROSTER_STAGE_ORDER,
  rosterLineNeedsAHand,
  type AnsweredClientNote,
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
      'quiet · nothing needs your hand',
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

    expect(roster.groups[0].lines[0].state).toContain('paused');
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

describe('deriveDeskDayLine — the day’s line quotes the grid (D7)', () => {
  function claimsOf(over: Partial<DeskRosterInput> = {}, notes: AnsweredClientNote[] = []) {
    return deriveDeskClaims({
      roster: deriveDeskRoster(input(over), NOW),
      answeredNotes: notes,
      now: NOW,
    });
  }

  it('names the first three cards, in the grid’s own rank order', () => {
    const late = row('late', 'project', { title: 'Vandersteen residence' });
    const mine = row('mine', 'project', { title: 'Cedar Lane study' });
    const theirs = row('theirs', 'proposal', { title: 'Halvorsen loft' });
    const fourth = row('fourth', 'care', { title: 'Osterberg cottage' });
    const result = claimsOf({
      live: [late, mine, theirs, fourth],
      folders: [
        folder(late, need({ owner: 'designer', dueOn: '2026-08-01' })),
        folder(mine, need({ owner: 'designer', text: 'Two rooms await your mark-up' })),
        folder(theirs, need({ owner: 'client', text: 'Opened, not signed' })),
        folder(fourth, need({ owner: 'maker', text: 'The maker has not acknowledged' })),
      ],
    });

    expect(result.dayLine!.lines.map((l) => l.key)).toEqual([
      'card-late',
      'card-mine',
      'card-theirs',
    ]);
    expect(result.dayLine!.lines[0].parts[0]).toEqual({
      kind: 'job',
      text: 'Vandersteen residence',
      engagementId: 'late',
    });
  });

  it('prints the overdue clause in the red letter’s own part kind', () => {
    const late = row('late', 'project');
    const result = claimsOf({
      live: [late],
      folders: [folder(late, need({ owner: 'designer', dueOn: '2026-08-01' }))],
    });
    const clause = result.dayLine!.lines[0].parts.find((p) => p.kind === 'overdue');

    expect(clause).toBeDefined();
    expect(clause!.text).toContain('overdue');
  });

  it('says the card’s own reason when nothing is overdue', () => {
    const mine = row('mine', 'project');
    const result = claimsOf({
      live: [mine],
      folders: [folder(mine, need({ owner: 'designer', text: 'Two rooms await your mark-up' }))],
    });

    expect(result.dayLine!.lines[0].parts[1]).toEqual({
      kind: 'text',
      text: ' — Two rooms await your mark-up',
    });
  });

  it('counts the cards it could not name, and points at the grid', () => {
    const live = ['a', 'b', 'c', 'd', 'e'].map((id) => row(id, 'project'));
    const result = claimsOf({
      live,
      folders: live.map((r) => folder(r, need({ owner: 'designer' }))),
    });

    expect(result.dayLine!.lines).toHaveLength(3);
    expect(result.dayLine!.more).toEqual({ count: 2, anchorId: CLAIMS_ANCHOR_ID });
  });

  it('has no more-link when every card is named', () => {
    const live = ['a', 'b'].map((id) => row(id, 'project'));
    const result = claimsOf({
      live,
      folders: live.map((r) => folder(r, need({ owner: 'designer' }))),
    });

    expect(result.dayLine!.more).toBeNull();
  });

  it('says nothing at all when nothing claims her hand', () => {
    // A "nothing needs you" banner over sixteen live jobs is a second queue.
    expect(claimsOf({ live: [row('a', 'project')] }).dayLine).toBeNull();
  });
});

describe('deriveDeskDayLine — the answered client note (D7’s fourth line)', () => {
  function claimsOf(over: Partial<DeskRosterInput> = {}, notes: AnsweredClientNote[] = []) {
    return deriveDeskClaims({
      roster: deriveDeskRoster(input(over), NOW),
      answeredNotes: notes,
      now: NOW,
    });
  }

  it('speaks for a job that has a CARD, below the three the line names', () => {
    const a = row('a', 'project', { title: 'Alder house' });
    const b = row('b', 'project', { title: 'Birch house' });
    const c = row('c', 'project', { title: 'Cedar house' });
    const claimed = row('claimed', 'project', {
      title: 'Byrne remodel',
      client_name: 'Erin Byrne',
      project_id: 'p-byrne',
    });
    const result = claimsOf(
      {
        live: [a, b, c, claimed],
        folders: [
          folder(a, need({ owner: 'designer' })),
          folder(b, need({ owner: 'designer' })),
          folder(c, need({ owner: 'designer' })),
          folder(claimed, need({ owner: 'maker' })),
        ],
      },
      [{ projectId: 'p-byrne', answeredAt: '2026-08-25T06:00:00Z' }],
    );

    expect(result.dayLine!.lines.map((l) => l.key)).toEqual([
      'card-a',
      'card-b',
      'card-c',
      'answered',
    ]);
    expect(result.dayLine!.lines[3].parts).toEqual([
      { kind: 'text', text: 'Erin Byrne replied last night — ' },
      { kind: 'job', text: 'Byrne remodel', engagementId: 'claimed' },
    ]);
  });

  it('never counts a card the note already named among “N more below”', () => {
    // Four cards, three quoted by rank and the fourth spoken by the note —
    // so nothing is left unnamed, and the more-link must not offer to show
    // the reader the job it has just finished telling them about.
    const a = row('a', 'project');
    const b = row('b', 'project');
    const c = row('c', 'project');
    const claimed = row('claimed', 'project', {
      client_name: 'Erin Byrne',
      project_id: 'p-byrne',
    });
    const result = claimsOf(
      {
        live: [a, b, c, claimed],
        folders: [
          folder(a, need({ owner: 'designer' })),
          folder(b, need({ owner: 'designer' })),
          folder(c, need({ owner: 'designer' })),
          folder(claimed, need({ owner: 'maker' })),
        ],
      },
      [{ projectId: 'p-byrne', answeredAt: '2026-08-25T06:00:00Z' }],
    );

    expect(result.cards).toHaveLength(4);
    expect(result.dayLine!.lines.map((l) => l.key)).toEqual([
      'card-a',
      'card-b',
      'card-c',
      'answered',
    ]);
    expect(result.dayLine!.more).toBeNull();
  });

  it('still counts the cards no line named at all', () => {
    const live = ['a', 'b', 'c', 'd'].map((id) => row(id, 'project'));
    const quiet = row('quiet', 'care', {
      client_name: 'Nora Ellison',
      project_id: 'p-nora',
    });
    const result = claimsOf(
      {
        live: [...live, quiet],
        folders: live.map((r) => folder(r, need({ owner: 'designer' }))),
      },
      [{ projectId: 'p-nora', answeredAt: '2026-08-25T06:00:00Z' }],
    );

    // The note spoke for a LEDGER row, so it took nothing off the card count.
    expect(result.dayLine!.more).toEqual({ count: 1, anchorId: CLAIMS_ANCHOR_ID });
  });

  it('speaks for a QUIET job that is only a ledger row', () => {
    // The client answering is news whether or not the job claims her hand;
    // searching only the cards would have silently dropped this line.
    const quiet = row('quiet', 'care', {
      title: 'Osterberg cottage',
      client_name: 'Nora Ellison',
      project_id: 'p-nora',
    });
    const result = claimsOf({ live: [quiet] }, [
      { projectId: 'p-nora', answeredAt: '2026-08-25T06:00:00Z' },
    ]);

    expect(result.cards).toEqual([]);
    expect(result.dayLine!.lines.map((l) => l.key)).toEqual(['answered']);
    expect(result.dayLine!.lines[0].parts).toEqual([
      { kind: 'text', text: 'Nora Ellison replied last night — ' },
      { kind: 'job', text: 'Osterberg cottage', engagementId: 'quiet' },
    ]);
  });

  it('never quotes one job twice — a named card takes the note’s slot', () => {
    const claimed = row('claimed', 'project', {
      title: 'Byrne remodel',
      client_name: 'Erin Byrne',
      project_id: 'p-byrne',
    });
    const other = row('other', 'care', {
      title: 'Osterberg cottage',
      client_name: 'Nora Ellison',
      project_id: 'p-nora',
    });
    const result = claimsOf(
      {
        live: [claimed, other],
        folders: [folder(claimed, need({ owner: 'designer' }))],
      },
      [
        { projectId: 'p-byrne', answeredAt: '2026-08-25T07:00:00Z' },
        { projectId: 'p-nora', answeredAt: '2026-08-25T06:00:00Z' },
      ],
    );

    // p-byrne is newest, but its job is already quoted as card-claimed, so the
    // note falls to the next unquoted job rather than naming Byrne twice.
    expect(result.dayLine!.lines.map((l) => l.engagementId)).toEqual([
      'claimed',
      'other',
    ]);
  });

  it('drops a note older than the window', () => {
    const quiet = row('quiet', 'care', {
      client_name: 'Nora Ellison',
      project_id: 'p-nora',
    });
    const result = claimsOf({ live: [quiet] }, [
      { projectId: 'p-nora', answeredAt: '2026-08-20T06:00:00Z' },
    ]);

    expect(result.dayLine).toBeNull();
  });

  it('cannot say the line without a client name', () => {
    // The roster refuses a role noun standing in for a name, and so does this.
    const quiet = row('quiet', 'care', {
      client_name: 'Client User',
      project_id: 'p-nora',
    });
    const result = claimsOf({ live: [quiet] }, [
      { projectId: 'p-nora', answeredAt: '2026-08-25T06:00:00Z' },
    ]);

    expect(result.dayLine).toBeNull();
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

describe('rosterLineNeedsAHand / filterRosterToNeeds (IA-11)', () => {
  function marked() {
    return deriveDeskRoster(
      input({
        live: [row('needy', 'project'), row('quiet', 'project')],
        folders: [folder(row('needy', 'project'))],
      }),
      NOW,
    );
  }

  it('counts every marked row as needing a hand, quiet marks included', () => {
    const [needy, quiet] = marked().groups[0].lines;
    expect(needy.mark).not.toBeNull();
    expect(rosterLineNeedsAHand(needy)).toBe(true);
    expect(quiet.mark).toBeNull();
    expect(rosterLineNeedsAHand(quiet)).toBe(false);
  });

  it('keeps only the marked rows and recounts the group', () => {
    const filtered = filterRosterToNeeds(marked().groups);

    expect(filtered).toHaveLength(1);
    expect(filtered[0].count).toBe(1);
    expect(filtered[0].lines.map((l) => l.engagementId)).toEqual(['needy']);
  });

  it('drops a group left with nothing in it', () => {
    const r = deriveDeskRoster(
      input({
        live: [row('a', 'project'), row('b', 'install')],
        folders: [folder(row('a', 'project'))],
      }),
      NOW,
    );

    expect(r.groups.map((g) => g.key)).toEqual(['project', 'install']);
    expect(filterRosterToNeeds(r.groups).map((g) => g.key)).toEqual([
      'project',
    ]);
  });

  it('returns nothing at all when nothing is marked', () => {
    const r = deriveDeskRoster(input({ live: [row('a', 'project')] }), NOW);
    expect(filterRosterToNeeds(r.groups)).toEqual([]);
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

describe('facetHeading (IA-11 / IA-12)', () => {
  const HEAD = 'Every job · 16 live · 1 overdue';

  it('says nothing extra with no facet on', () => {
    expect(facetHeading(HEAD, { needsMe: false, byPerson: false })).toBe(HEAD);
  });

  it('names each facet, and both together, in words', () => {
    expect(facetHeading(HEAD, { needsMe: true, byPerson: false })).toBe(
      `${HEAD} · showing what needs you`,
    );
    expect(facetHeading(HEAD, { needsMe: false, byPerson: true })).toBe(
      `${HEAD} · by person`,
    );
    expect(facetHeading(HEAD, { needsMe: true, byPerson: true })).toBe(
      `${HEAD} · showing what needs you · by person`,
    );
  });
});

describe('the empty facet sentence', () => {
  it('is a sentence, not an empty list', () => {
    expect(NOTHING_NEEDS_YOU).toBe('Nothing needs your hand today.');
  });
});

describe('D6 · custodyWord — whose hand, in words', () => {
  it('says Your pen for the studio’s own need', () => {
    expect(custodyWord(need({ owner: 'designer' }), row('a', 'project'))).toBe(
      'Your pen',
    );
  });

  it('defaults to Your pen when the rule stated no owner at all', () => {
    expect(custodyWord(need({ owner: undefined }), row('a', 'project'))).toBe(
      'Your pen',
    );
    expect(custodyWord(need({ owner: null }), row('a', 'project'))).toBe(
      'Your pen',
    );
  });

  it('names the client by first name where the row carries one', () => {
    const r = row('a', 'project', { client_name: 'Nora Ellison' });
    expect(custodyWord(need({ owner: 'client' }), r)).toBe('With Nora');
  });

  it('falls back to With the client where the name is a placeholder', () => {
    // `clientOf` refuses the seed's `Client User` as a family name, and so
    // does this — a role noun never stands in for a name we do not have.
    const r = row('a', 'project', { client_name: 'Client User' });
    expect(custodyWord(need({ owner: 'client' }), r)).toBe('With the client');
  });

  it('falls back to With the client where the row carries no name', () => {
    const r = row('a', 'project', { client_name: null });
    expect(custodyWord(need({ owner: 'client' }), r)).toBe('With the client');
  });

  it('says With the maker for a vendor-owned need', () => {
    expect(custodyWord(need({ owner: 'maker' }), row('a', 'project'))).toBe(
      'With the maker',
    );
  });

  it('says At rest where there is no need at all', () => {
    expect(custodyWord(null, row('a', 'project'))).toBe('At rest');
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
      'With Nora',
    );
    expect(lines.find((l) => l.engagementId === 'claimed')!.needOwner).toBe(
      'client',
    );
    expect(lines.find((l) => l.engagementId === 'quiet')!.custody).toBe('At rest');
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
      answeredNotes: [],
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

  it('agrees with filterRosterToNeeds, which is the same predicate', () => {
    const claimed = row('claimed', 'project');
    const quiet = row('quiet', 'project');
    const roster = deriveDeskRoster(
      input({ live: [claimed, quiet], folders: [folder(claimed)] }),
      NOW,
    );
    const result = deriveDeskClaims({ roster, answeredNotes: [], now: NOW });

    expect(result.cards.map((c) => c.line.engagementId)).toEqual(
      filterRosterToNeeds(roster.groups).flatMap((g) =>
        g.lines.map((l) => l.engagementId),
      ),
    );
  });

  it('keeps the roster’s own heading, and counts the ledger head', () => {
    const claimed = row('claimed', 'project');
    const quiet = row('quiet', 'project');
    const result = claimsOf({ live: [claimed, quiet], folders: [folder(claimed)] });

    expect(result.heading).toBe('Every job · 2 live · 0 overdue');
    expect(result.restHeading).toBe('At rest · 1 job');
  });

  it('pluralises the ledger head, and says nothing over an empty ledger', () => {
    const a = row('a', 'project');
    const b = row('b', 'project');
    expect(claimsOf({ live: [a, b] }).restHeading).toBe('At rest · 2 jobs');
    expect(claimsOf({ live: [] }).restHeading).toBe('');
  });

  it('keeps the ledger under the paper’s own stage order (D8)', () => {
    const live = [...ROSTER_STAGE_ORDER].reverse().map((s) => row(s, s));
    const result = claimsOf({ live });

    expect(result.ledger.map((g) => g.key)).toEqual([...ROSTER_STAGE_ORDER]);
    expect(result.cards).toEqual([]);
  });
});

describe('D3 · the cards rank by band, then oldest, then name', () => {
  function claimsOf(over: Partial<DeskRosterInput> = {}) {
    return deriveDeskClaims({
      roster: deriveDeskRoster(input(over), NOW),
      answeredNotes: [],
      now: NOW,
    });
  }

  it('bands designer+overdue, designer, client, maker — in that order', () => {
    const late = row('z-late', 'project', { title: 'Z overdue' });
    const mine = row('m-mine', 'project', { title: 'M owned' });
    const theirs = row('client-held', 'project', { title: 'Client held' });
    const maker = row('maker-held', 'project', { title: 'Maker held' });
    const result = claimsOf({
      live: [maker, theirs, mine, late],
      folders: [
        folder(maker, need({ owner: 'maker' })),
        folder(theirs, need({ owner: 'client' })),
        folder(mine, need({ owner: 'designer' })),
        folder(late, need({ owner: 'designer', dueOn: '2026-08-01' })),
      ],
    });

    expect(result.cards.map((c) => c.band)).toEqual([0, 1, 2, 3]);
    expect(result.cards.map((c) => c.line.engagementId)).toEqual([
      'z-late',
      'm-mine',
      'client-held',
      'maker-held',
    ]);
  });

  it('puts the oldest need date first inside a band', () => {
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

  it('orders two UNDATED same-band cards by name', () => {
    // Both dueOn are absent, so both anchor times are +Infinity and the date
    // comparison yields NaN, not 0. NaN is falsy, so `||` falls through to the
    // name comparison — the behaviour this test pins, because a subtraction
    // that returns NaN silently is exactly the kind of thing a refactor
    // "simplifies" into a broken sort.
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

  it('sorts a dated card ahead of an undated one in the same band', () => {
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
    expect(result.cards[0].stageLabel).toBe('Project');
    expect(result.cards[0].custody).toBe('Your pen');
  });
});

describe('IA-12 · By person regroups the card half too', () => {
  const PEOPLE = deriveRosterPeople([
    {
      user_id: 'user-leah',
      role: 'owner',
      status: 'active',
      profiles: { full_name: 'Leah Hartwell', display_name: null },
    },
    {
      user_id: 'user-anneke',
      role: 'member',
      status: 'active',
      profiles: { full_name: 'Anneke Sund', display_name: null },
    },
  ]);

  function cardsOf(over: Partial<DeskRosterInput> = {}) {
    return deriveDeskClaims({
      roster: deriveDeskRoster(input(over), NOW),
      answeredNotes: [],
      now: NOW,
    }).cards;
  }

  it('groups the cards by designerId, principal first', () => {
    const mine = row('mine', 'project', { designer_id: 'user-leah' });
    const hers = row('hers', 'project', { designer_id: 'user-anneke' });
    const grouped = groupClaimsByPerson(
      cardsOf({ live: [mine, hers], folders: [folder(mine), folder(hers)] }),
      PEOPLE,
    );

    expect(grouped.map((g) => [g.label, g.count])).toEqual([
      ['Leah Hartwell', 1],
      ['Anneke Sund', 1],
    ]);
    expect(grouped[0].cards[0].line.engagementId).toBe('mine');
  });

  it('groups an unassigned card under the principal, never dropping it', () => {
    const orphan = row('orphan', 'project', { designer_id: null });
    const grouped = groupClaimsByPerson(
      cardsOf({ live: [orphan], folders: [folder(orphan)] }),
      PEOPLE,
    );

    expect(grouped).toHaveLength(1);
    expect(grouped[0].count).toBe(1);
  });

  it('returns nothing to group when the studio has no named people', () => {
    const mine = row('mine', 'project');
    expect(groupClaimsByPerson(cardsOf({ live: [mine], folders: [folder(mine)] }), [])).toEqual([]);
  });
});
