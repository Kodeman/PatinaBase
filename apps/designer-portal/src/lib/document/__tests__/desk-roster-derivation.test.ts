import type {
  DeskFolder,
  DocumentStateRow,
  MotionChip,
  NeedKind,
  NeedLine,
  SectionKey,
} from '@/lib/document/desk-derivation';
import {
  deriveDeskRoster,
  OPEN_THE_JOB,
  ROSTER_STAGE_ORDER,
  type DeskRosterInput,
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
