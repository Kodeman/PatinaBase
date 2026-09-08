import type {
  DeskFolder,
  DocumentStateRow,
  MotionChip,
  NeedKind,
  NeedLine,
  SectionKey,
} from '@/lib/document/desk-derivation';
import {
  deriveDeskDayLine,
  deriveDeskRoster,
  deriveRosterPeople,
  facetHeading,
  filterRosterToNeeds,
  groupRosterByPerson,
  NOTHING_NEEDS_YOU,
  OPEN_THE_JOB,
  ROSTER_STAGE_ORDER,
  rosterLineNeedsAHand,
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

describe('deriveDeskDayLine — the day’s line (IA-05)', () => {
  const HOUR = 3_600_000;

  const overdueRow = () =>
    row('vandersteen', 'project', {
      title: 'Vandersteen residence',
      client_name: 'Anne Vandersteen',
      project_id: 'p-vandersteen',
    });
  const leadRow = () =>
    row('wright', 'brief', {
      title: 'Wright apartment',
      client_name: 'Marcus Wright',
      project_id: null,
    });
  const answeredRow = () =>
    row('cedar', 'install', {
      title: 'Cedar Lane Study',
      client_name: 'Nora Ellison',
      project_id: 'p-cedar',
    });

  const overdueNeed = () => need({ kind: 'overdue_invoice', dueOn: '2026-08-19' });
  const leadNeed = () =>
    need({
      kind: 'new_lead',
      text: 'New lead — respond by Aug 27',
      dueOn: '2026-08-27',
    });

  function threeLineRoster() {
    const v = overdueRow();
    const l = leadRow();
    const c = answeredRow();
    return deriveDeskRoster(
      input({
        live: [v, l, c],
        folders: [folder(v, overdueNeed()), folder(l, leadNeed()), folder(c)],
      }),
      NOW,
    );
  }

  const answeredNote = (projectId: string, at: string) => ({
    projectId,
    answeredAt: at,
  });

  it('says three things, and each one is a view of a row on the page', () => {
    const roster = threeLineRoster();
    const dayLine = deriveDeskDayLine(
      roster,
      [answeredNote('p-cedar', new Date(NOW.getTime() - 8 * HOUR).toISOString())],
      NOW,
    )!;

    expect(dayLine.lines.map((line) => line.key)).toEqual([
      'overdue',
      'lead',
      'answered',
    ]);

    const onThePage = new Set(
      roster.groups.flatMap((group) =>
        group.lines.map((line) => line.engagementId),
      ),
    );
    for (const line of dayLine.lines) {
      expect(onThePage.has(line.engagementId)).toBe(true);
      for (const part of line.parts) {
        if (part.kind === 'job') expect(onThePage.has(part.engagementId)).toBe(true);
      }
    }
  });

  it('links the overdue job and puts the clause after the dash in its own part', () => {
    const dayLine = deriveDeskDayLine(threeLineRoster(), [], NOW)!;
    const [overdue] = dayLine.lines;

    expect(overdue.parts[0]).toEqual({
      kind: 'job',
      text: 'Vandersteen residence',
      engagementId: 'vandersteen',
    });
    expect(overdue.parts[1].kind).toBe('overdue');
    expect(overdue.parts[1].text).toMatch(/^ — project, overdue \d+ days?$/);
  });

  it('names the person she is keeping waiting, then borrows the lead’s own sentence', () => {
    const dayLine = deriveDeskDayLine(threeLineRoster(), [], NOW)!;
    const lead = dayLine.lines.find((line) => line.key === 'lead')!;

    expect(lead.parts).toEqual([
      { kind: 'job', text: 'Marcus Wright', engagementId: 'wright' },
      { kind: 'text', text: ' · New lead — respond by Aug 27' },
    ]);
  });

  it('falls back to the job when the lead row carries no named client', () => {
    const unnamed = row('unnamed', 'brief', {
      title: 'Harbour flat',
      client_name: '',
      project_id: null,
    });
    const roster = deriveDeskRoster(
      input({ live: [unnamed], folders: [folder(unnamed, leadNeed())] }),
      NOW,
    );

    const lead = deriveDeskDayLine(roster, [], NOW)!.lines.find(
      (line) => line.key === 'lead',
    )!;
    expect(lead.parts[0]).toEqual({
      kind: 'job',
      text: 'Harbour flat',
      engagementId: 'unnamed',
    });
  });

  it('leaves a reconnect touchpoint to the roster row — the lead slot is new leads only', () => {
    const nurtured = row('nurtured', 'brief', {
      title: 'Kessler loft',
      client_name: 'Ivy Kessler',
      project_id: null,
    });
    const roster = deriveDeskRoster(
      input({
        live: [nurtured],
        folders: [
          folder(
            nurtured,
            need({
              kind: 'reconnect_due',
              text: 'Reconnect — touchpoint due Aug 20',
              dueOn: '2026-08-20',
            }),
          ),
        ],
      }),
      NOW,
    );

    const dayLine = deriveDeskDayLine(roster, [], NOW);
    expect(dayLine?.lines.some((line) => line.key === 'lead') ?? false).toBe(
      false,
    );
  });

  it('takes the earliest lead deadline when two leads are open', () => {
    const soon = row('soon', 'brief', { title: 'Soon', client_name: 'A Soon' });
    const later = row('later', 'brief', { title: 'Later', client_name: 'B Later' });
    const roster = deriveDeskRoster(
      input({
        live: [later, soon],
        folders: [
          folder(later, need({ kind: 'new_lead', text: 'New lead — respond by Sep 4', dueOn: '2026-09-04' })),
          folder(soon, need({ kind: 'new_lead', text: 'New lead — respond by Aug 27', dueOn: '2026-08-27' })),
        ],
      }),
      NOW,
    );

    const dayLine = deriveDeskDayLine(roster, [], NOW)!;
    expect(dayLine.lines[0].engagementId).toBe('soon');
  });

  it('names the client who replied, and reads the note within the day only', () => {
    const roster = threeLineRoster();
    const inside = deriveDeskDayLine(
      roster,
      [answeredNote('p-cedar', new Date(NOW.getTime() - 8 * HOUR).toISOString())],
      NOW,
    )!;
    const answered = inside.lines.find((line) => line.key === 'answered')!;
    expect(answered.parts).toEqual([
      { kind: 'text', text: 'Nora Ellison replied last night — ' },
      { kind: 'job', text: 'Cedar Lane Study', engagementId: 'cedar' },
    ]);

    const outside = deriveDeskDayLine(
      roster,
      [answeredNote('p-cedar', new Date(NOW.getTime() - 25 * HOUR).toISOString())],
      NOW,
    )!;
    expect(outside.lines.some((line) => line.key === 'answered')).toBe(false);
  });

  it('stays silent about a reply it cannot attribute to a named client', () => {
    const anonymous = row('anon', 'install', {
      title: 'Anonymous project',
      client_name: 'Client User',
      project_id: 'p-anon',
    });
    const v = overdueRow();
    const roster = deriveDeskRoster(
      input({ live: [v, anonymous], folders: [folder(v, overdueNeed()), folder(anonymous)] }),
      NOW,
    );

    const dayLine = deriveDeskDayLine(
      roster,
      [answeredNote('p-anon', new Date(NOW.getTime() - HOUR).toISOString())],
      NOW,
    )!;
    expect(dayLine.lines.some((line) => line.key === 'answered')).toBe(false);
  });

  it('never grows past three lines, and counts the rest below', () => {
    const v = overdueRow();
    const l = leadRow();
    const c = answeredRow();
    const rest = Array.from({ length: 12 }, (_, i) =>
      row(`rest-${i}`, 'project', {
        title: `Rest ${i}`,
        client_name: `Family ${i}`,
      }),
    );
    const roster = deriveDeskRoster(
      input({
        live: [v, l, c, ...rest],
        folders: [
          folder(v, overdueNeed()),
          folder(l, leadNeed()),
          folder(c),
          ...rest.map((r) => folder(r)),
        ],
      }),
      NOW,
    );

    const dayLine = deriveDeskDayLine(
      roster,
      [answeredNote('p-cedar', new Date(NOW.getTime() - HOUR).toISOString())],
      NOW,
    )!;

    expect(dayLine.lines).toHaveLength(3);
    expect(dayLine.more).toEqual({ count: 12, stageKey: 'brief' });
  });

  it('renders nothing at all when nothing needs her', () => {
    const quiet = Array.from({ length: 6 }, (_, i) => row(`quiet-${i}`, 'project'));

    expect(
      deriveDeskDayLine(deriveDeskRoster(input({ live: quiet }), NOW), [], NOW),
    ).toBeNull();
    expect(deriveDeskDayLine(deriveDeskRoster(input({}), NOW), [], NOW)).toBeNull();
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
