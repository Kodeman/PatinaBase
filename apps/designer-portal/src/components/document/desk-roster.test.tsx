import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  AnsweredClientNote,
  DeskRoster as DeskRosterModel,
  RosterMember,
} from '@/lib/document/desk-roster-derivation';
import { DeskRoster } from './desk-roster';

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

jest.mock('@/components/document/command-bar', () => ({
  openLedger: jest.fn(),
}));

// The day's line's own read. Mocked here so the roster stays renderable
// without a QueryClient; the notes themselves are set per-test.
const mockAnsweredNotes = jest.fn(() => [] as AnsweredClientNote[]);
jest.mock('@/hooks/use-answered-notes', () => ({
  useAnsweredNotes: () => ({ data: mockAnsweredNotes() }),
}));

const LEAH = 'user-leah';
const ANNEKE = 'user-anneke';

function member(over: Partial<RosterMember> = {}): RosterMember {
  return {
    user_id: LEAH,
    role: 'owner',
    status: 'active',
    profiles: { full_name: 'Leah Hartwell', display_name: null },
    ...over,
  };
}

const STUDIO: RosterMember[] = [
  member(),
  member({
    user_id: ANNEKE,
    role: 'member',
    profiles: { full_name: 'Anneke Sund', display_name: null },
  }),
];

function roster(over: Partial<DeskRosterModel> = {}): DeskRosterModel {
  return {
    heading: 'Every job · 3 live · 1 overdue',
    overdueLine: 'One thing is overdue — Vandersteen.',
    liveCount: 3,
    overdueCount: 1,
    groups: [
      {
        key: 'proposal',
        label: 'Proposal',
        count: 1,
        lines: [
          {
            engagementId: 'byrne',
            name: 'Byrne remodel',
            stage: 'proposal',
            designerId: ANNEKE,
            state: 'Erin Byrne · design agreement sent August 19',
            overdueText: null,
            mark: 'quiet',
            custody: 'With Erin',
            needOwner: 'client',
            needKind: 'hesitating_proposal',
            overdue: { isOverdue: false, days: 0 },
            jobHref: '/doc/byrne',
            act: { label: 'Follow up', href: '/doc/byrne' },
          },
        ],
      },
      {
        key: 'project',
        label: 'Project',
        count: 2,
        lines: [
          {
            engagementId: 'vandersteen',
            name: 'Vandersteen residence',
            stage: 'project',
            designerId: null,
            state: 'Anne Vandersteen · Procurement And Orders',
            overdueText:
              'Overdue 6 days — Invoice 1042 · $17,500 overdue — oldest due Aug 2 — send a reminder',
            mark: 'urgent',
            custody: 'Your pen',
            needOwner: 'designer',
            needKind: 'overdue_invoice',
            overdue: { isOverdue: true, days: 6 },
            jobHref: '/doc/vandersteen',
            act: {
              label: 'Send reminder',
              href: '/doc/vandersteen',
              ledger: {
                name: 'accounts',
                context: { page: 'receivables', invoiceId: 'inv-1' },
              },
            },
          },
          {
            engagementId: 'reinhardt',
            name: 'Reinhardt lake house',
            stage: 'project',
            designerId: LEAH,
            state: 'Reinhardt · Site Visit · quiet · nothing needs your hand',
            overdueText: null,
            mark: null,
            needKind: null,
            overdue: { isOverdue: false, days: 0 },
            jobHref: '/doc/reinhardt',
            act: { label: 'Open the job', href: '/doc/reinhardt' },
            custody: 'At rest',
            needOwner: null,
            motionText: 'With client since 4 Aug',
            valueText: '4 Aug',
          },
        ],
      },
    ],
    ...over,
  };
}

describe('DeskRoster — the header', () => {
  it('states every job, how many are live, and how many are overdue', () => {
    render(<DeskRoster roster={roster()} />);
    expect(
      screen.getByText('Every job · 3 live · 1 overdue'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('One thing is overdue — Vandersteen.'),
    ).toBeInTheDocument();
  });
});

describe('DeskRoster — the two halves', () => {
  it('lets a long job name wrap instead of widening the page (390)', () => {
    // The name wraps, never truncates, in both halves. The wrap rides the
    // link itself on a ledger row and a nested span on a card, so the
    // assertion reads the name's own subtree rather than only its class list.
    const { container } = render(<DeskRoster roster={roster()} />);
    const names = container.querySelectorAll('[data-roster-name]');
    expect(names).toHaveLength(3);
    for (const name of names) {
      expect(name.className.toString()).toContain('min-w-0');
      expect(name.outerHTML).toContain('[overflow-wrap:anywhere]');
      expect(name.outerHTML).not.toContain('truncate');
      expect(name.outerHTML).not.toContain('whitespace-nowrap');
    }
  });

  it('lets the sentence under the name wrap too, or the page still widens (390)', () => {
    const { container } = render(<DeskRoster roster={roster()} />);
    const sentences = container.querySelectorAll(
      '[data-register="sentence"], [data-ledger-cell="sentence"]',
    );
    expect(sentences).toHaveLength(3);
    for (const sentence of sentences) {
      expect(sentence.className.toString()).toContain(
        '[overflow-wrap:anywhere]',
      );
      expect(sentence.className.toString()).not.toContain('truncate');
      expect(sentence.className.toString()).not.toContain('whitespace-nowrap');
    }
  });

  it('folds nothing on first paint, in either half', () => {
    const { container } = render(<DeskRoster roster={roster()} />);

    expect(container.querySelector('[aria-expanded]')).toBeNull();
    expect(container.querySelector('[hidden]')).toBeNull();
  });

  it('never prints a badge or a count beside a job', () => {
    const { container } = render(<DeskRoster roster={roster()} />);

    for (const mark of container.querySelectorAll('[data-roster-mark]')) {
      expect(mark.textContent).toBe('');
      expect(mark.getAttribute('aria-hidden')).toBe('true');
    }
  });
});

describe('DeskRoster — the marks', () => {
  it('fills the card’s mark and rings the at-rest row’s', () => {
    const { container } = render(<DeskRoster roster={roster()} />);

    expect(
      Array.from(
        container.querySelectorAll('[data-claim-card] [data-roster-mark]'),
      ).map((m) => m.getAttribute('data-mark-tone')),
    ).toEqual(['urgent', 'quiet']);

    const ring = container.querySelector<HTMLElement>(
      '[data-ledger-row] [data-roster-mark]',
    )!;
    expect(ring.getAttribute('data-mark-tone')).toBeNull();
    expect(ring.className).toContain('border');
  });

  it('moves a job whose need is gone out of the cards and into the ledger', () => {
    const model = roster();
    model.groups[0].lines[0].mark = null;
    model.groups[0].lines[0].needKind = null;
    const { container } = render(<DeskRoster roster={model} />);

    expect(
      Array.from(container.querySelectorAll('[data-claim-card]')).map((el) =>
        el.getAttribute('data-claim-card'),
      ),
    ).toEqual(['vandersteen']);
    expect(
      Array.from(container.querySelectorAll('[data-ledger-row]')).map((el) =>
        el.getAttribute('data-ledger-row'),
      ),
    ).toEqual(['byrne', 'reinhardt']);
  });

  it('gives a quiet need a different stamp colour from a red-letter one', () => {
    const { container } = render(<DeskRoster roster={roster()} />);

    const [urgent, quiet] = Array.from(
      container.querySelectorAll<HTMLElement>(
        '[data-claim-card] [data-roster-mark]',
      ),
    );
    expect(urgent.getAttribute('data-mark-tone')).toBe('urgent');
    expect(quiet.getAttribute('data-mark-tone')).toBe('quiet');
    expect(quiet.getAttribute('data-mark-color')).not.toBe(
      urgent.getAttribute('data-mark-color'),
    );
  });
});

describe('DeskRoster — the acts', () => {
  it('carries the receivable’s figure and age on the invoice card', () => {
    render(<DeskRoster roster={roster()} />);

    const overdue = screen.getByText(/Overdue 6 days/);
    expect(overdue).toHaveTextContent('$17,500');
    expect(overdue).toHaveTextContent('oldest due Aug 2');
    expect(screen.getByText('Send reminder')).toBeInTheDocument();
  });

  it('names the job on every act, so eleven `Open the job`s are eleven acts', () => {
    render(<DeskRoster roster={roster()} />);

    expect(
      screen.getByRole('button', {
        name: 'Send reminder — Vandersteen residence',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Follow up — Byrne remodel' }),
    ).toBeInTheDocument();
    // The at-rest half names its jobs on the same rule.
    expect(
      screen.getByRole('link', { name: 'Open the job — Reinhardt lake house' }),
    ).toBeInTheDocument();
  });

  it('prints one act per job, in either half', () => {
    const { container } = render(<DeskRoster roster={roster()} />);

    const jobs = container.querySelectorAll(
      '[data-claim-card], [data-ledger-row]',
    );
    expect(jobs).toHaveLength(3);
    for (const job of jobs) {
      expect(job.querySelectorAll('.da-act')).toHaveLength(1);
    }
  });

  it('adds no region landmark per stage group', () => {
    const { container } = render(<DeskRoster roster={roster()} />);
    // The Desk is one region; the stage headings over the ledger must not
    // become landmarks nested inside its action group.
    expect(container.querySelectorAll('section')).toHaveLength(1);
    expect(
      screen.getByRole('heading', { name: 'Project · 1' }),
    ).toBeInTheDocument();
  });

  it('opens the job from its own name, and prints the job’s act beside it', () => {
    render(<DeskRoster roster={roster()} />);

    expect(
      screen.getByRole('link', { name: 'Vandersteen residence' }),
    ).toHaveAttribute('href', '/doc/vandersteen');
    expect(screen.getByText('Follow up')).toBeInTheDocument();
  });

  it('falls back to opening the job where the job has no act of its own', () => {
    const model = roster();
    model.groups[0].lines[0].act = {
      label: 'Open the job',
      href: '/doc/byrne',
    };
    render(<DeskRoster roster={model} />);

    expect(
      screen.getByRole('link', { name: 'Open the job — Byrne remodel' }),
    ).toBeInTheDocument();
  });
});

describe('DeskRoster — an empty desk', () => {
  it('says the work is in motion and keeps the walkthrough anchor', () => {
    const { container } = render(
      <DeskRoster
        roster={roster({
          groups: [],
          liveCount: 0,
          overdueCount: 0,
          heading: 'Every job · 0 live · 0 overdue',
          overdueLine: 'Nothing is overdue.',
        })}
      />,
    );

    expect(
      screen.getByText('Nothing needs your hand. The work is in motion.'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-tour-anchor="desk-folio"]'),
    ).not.toBeNull();
  });

  it('keeps the desk-folio anchor when there are no cards, only rows', () => {
    // The quietest live Desk: every job at rest. The walkthrough's fourth stop
    // has to land on something, and the at-rest head is what is there.
    const quiet = roster();
    const allQuiet = {
      ...quiet,
      overdueCount: 0,
      heading: 'Every job · 3 live · 0 overdue',
      groups: quiet.groups.map((group) => ({
        ...group,
        lines: group.lines.map((line) => ({
          ...line,
          mark: null,
          needKind: null,
          needOwner: null,
          custody: 'At rest',
          overdueText: null,
          overdue: { isOverdue: false, days: 0 },
        })),
      })),
    };
    const { container } = render(<DeskRoster roster={allQuiet} />);

    expect(container.querySelectorAll('[data-claim-card]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-ledger-row]')).toHaveLength(3);
    const anchor = container.querySelector('[data-tour-anchor="desk-folio"]');
    expect(anchor).not.toBeNull();
    // Not just "something" — the at-rest head itself.
    expect(anchor).toHaveAttribute('data-desk-rest-head');
  });
});

describe('DeskRoster — the stage tabs (R126)', () => {
  it('prints each at-rest stage head as a plate in its own pigment', () => {
    const { container } = render(<DeskRoster roster={roster()} />);

    const project = container.querySelector('[data-stage-tab="project"]')!;
    expect(project.className).toContain('bg-[var(--tab-project)]');
    // A plate, not a band: it hugs its own words and nothing sits behind the
    // rows below it.
    expect(project.className).toContain('inline-flex');
    expect(project.className).toContain('text-white');
    expect(project.textContent).toBe('Project · 1');
    // The mockup's .stage-head letter-spacing.
    expect(project.className).toContain('tracking-[0.1em]');
    // Proposal has nothing at rest, so it heads nothing at all — and the
    // plates are the ledger's alone.
    expect(container.querySelector('[data-stage-tab="proposal"]')).toBeNull();
    expect(container.querySelectorAll('[data-stage-tab]')).toHaveLength(1);
  });

  it('ends each ledger row on the solid hairline, never a dashed one', () => {
    // Dashed goes back to meaning “not filled in” and appears nowhere
    // (globals.css, R126). `.desk-ledger-row` spends the solid
    // --doc-ink-border for its own top rule.
    const { container } = render(<DeskRoster roster={roster()} />);

    const rows = container.querySelectorAll<HTMLElement>('[data-ledger-row]');
    expect(rows).toHaveLength(1);
    for (const row of rows) {
      expect(row.className).toContain('desk-ledger-row');
      expect(row.className).not.toContain('border-dashed');
    }
  });

  it('gives every stage a tab, and lends Care the Install pigment', () => {
    const model = roster();
    const stages: Array<[DeskRosterModel['groups'][number]['key'], string]> = [
      ['brief', 'bg-[var(--tab-brief)]'],
      ['discovery', 'bg-[var(--tab-discovery)]'],
      ['direction', 'bg-[var(--tab-direction)]'],
      ['proposal', 'bg-[var(--tab-proposal)]'],
      ['project', 'bg-[var(--tab-project)]'],
      ['install', 'bg-[var(--tab-install)]'],
      ['care', 'bg-[var(--tab-install)]'],
    ];
    model.groups = stages.map(([key], i) => ({
      key,
      label: key,
      count: 1,
      lines: [
        {
          ...roster().groups[0].lines[0],
          engagementId: `job-${i}`,
          stage: key,
          // A stage plate heads the AT-REST half, so these jobs are at rest.
          mark: null,
          needKind: null,
          needOwner: null,
        },
      ],
    }));
    const { container } = render(<DeskRoster roster={model} />);

    for (const [key, pigment] of stages) {
      expect(
        container.querySelector(`[data-stage-tab="${key}"]`)!.className,
      ).toContain(pigment);
    }
  });
});

describe('DeskRoster — the hover wash (R126)', () => {
  it('gives every card and row a wash in its stage’s own pigment', () => {
    const { container } = render(<DeskRoster roster={roster()} />);

    const rows = Array.from(
      container.querySelectorAll<HTMLElement>(
        '[data-claim-card], [data-ledger-row]',
      ),
    );
    expect(rows).toHaveLength(3);
    const tones = rows.map((row) => {
      expect(row.className).toContain('has-wash');
      const wash = row.querySelector<HTMLElement>('span.row-wash')!;
      // First child: the wash paints over the ground and under every word.
      expect(row.firstElementChild).toBe(wash);
      expect(wash.getAttribute('aria-hidden')).toBe('true');
      return wash.style.getPropertyValue('--wash');
    });
    // The cards rank first (D3); the ledger keeps its stage order below them.
    expect(tones).toEqual([
      'var(--wash-project)',
      'var(--wash-proposal)',
      'var(--wash-project)',
    ]);
  });

  it('draws exactly one clay line under the job name — the wash’s own score', () => {
    const { container } = render(<DeskRoster roster={roster()} />);

    for (const row of container.querySelectorAll(
      '[data-claim-card], [data-ledger-row]',
    )) {
      // The score rides a nested span on a card and the link itself on a row;
      // either way exactly one. A text-decoration hover path would draw a
      // second line under the same word.
      expect(row.querySelectorAll('.row-wash-score')).toHaveLength(1);
      expect(row.querySelector('[data-roster-name]')!.outerHTML).not.toMatch(
        /decoration-\[var\(--color-clay\)\]/,
      );
    }
  });

  it('leaves the act as the row’s own focusable control', () => {
    render(<DeskRoster roster={roster()} />);

    expect(
      screen.getByRole('button', {
        name: 'Send reminder — Vandersteen residence',
      }),
    ).toBeInTheDocument();
  });
});

describe('DeskRoster — the marks are unchanged by the wash', () => {
  // D9 — the material pigments read 2.13:1 (terracotta) and 2.64:1 (dusty
  // blue) on paper and failed 1.4.11 as graphical objects. The ink members
  // read 5.28:1 and 7.86:1 and are the same two registers.
  it('keeps terracotta-ink for urgent and mocha for quiet', () => {
    const { container } = render(<DeskRoster roster={roster()} />);

    const [urgent, quiet] = Array.from(
      container.querySelectorAll<HTMLElement>(
        '[data-claim-card] [data-roster-mark]',
      ),
    );
    expect(urgent.getAttribute('data-mark-color')).toBe(
      'var(--color-terracotta-ink)',
    );
    expect(quiet.getAttribute('data-mark-color')).toBe('var(--color-mocha)');
  });
});

describe('DeskRoster — the day’s line (IA-05)', () => {
  beforeEach(() => {
    mockAnsweredNotes.mockReturnValue([]);
  });

  function richRoster(): DeskRosterModel {
    const model = roster();
    model.groups[0].lines[0] = {
      ...model.groups[0].lines[0],
      engagementId: 'wright',
      name: 'Wright apartment',
      needKind: 'new_lead',
      needOwner: 'designer',
      dueOn: '2026-08-27',
      needText: 'New lead — respond by Aug 27',
      client: 'Marcus Wright',
      projectId: null,
    };
    // The at-rest job is the one whose client answered: a client answering is
    // news whether or not the job claims her hand.
    model.groups[1].lines[1] = {
      ...model.groups[1].lines[1],
      client: 'Nora Ellison',
      projectId: 'p-reinhardt',
    };
    return model;
  }

  it('renders nothing at all when nothing needs her', () => {
    const model = roster();
    for (const group of model.groups) {
      for (const line of group.lines) {
        line.mark = null;
        line.needKind = null;
        line.overdueText = null;
        line.overdue = { isOverdue: false, days: 0 };
      }
    }
    model.overdueCount = 0;
    model.overdueLine = 'Nothing is overdue.';

    const { container } = render(<DeskRoster roster={model} />);

    expect(container.querySelector('[data-desk-day-line]')).toBeNull();
    expect(screen.queryByText(/more below/)).toBeNull();
  });

  it('names the overdue job as an act into its own card, the clause in the red letter’s ink', () => {
    const { container } = render(<DeskRoster roster={roster()} />);

    const band = container.querySelector('[data-desk-day-line]')!;
    const link = within(band as HTMLElement).getByRole('link', {
      name: 'Vandersteen residence — the card below',
    });
    expect(link).toHaveAttribute('href', '#roster-line-vandersteen');
    expect(container.querySelector('#roster-line-vandersteen')).toHaveAttribute(
      'data-claim-card',
      'vandersteen',
    );

    const clause = band.querySelector('[data-day-line-overdue]')!;
    expect(clause.className).toContain('var(--color-terracotta-ink)');
    expect(clause.textContent).toMatch(/^ — overdue \d+ days?$/);
    // The sentence above the band is untouched — the head count, the sentence
    // and the card's mark stay three legible levels of one fact.
    expect(
      screen.getByText('One thing is overdue — Vandersteen.'),
    ).toBeInTheDocument();
  });

  it('carries every line into a card or a row that is already on the page', () => {
    mockAnsweredNotes.mockReturnValue([
      { projectId: 'p-reinhardt', answeredAt: new Date().toISOString() },
    ]);
    const { container } = render(<DeskRoster roster={richRoster()} />);

    const band = container.querySelector('[data-desk-day-line]')!;
    const links = Array.from(band.querySelectorAll('a[href^="#roster-line-"]'));
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      const id = link.getAttribute('href')!.slice(1);
      const target = container.querySelector(`[id="${id}"]`)!;
      expect(
        target.hasAttribute('data-claim-card') ||
          target.hasAttribute('data-ledger-row'),
      ).toBe(true);
    }
  });

  it('says at most three cards and the note, and names the client who replied', () => {
    mockAnsweredNotes.mockReturnValue([
      { projectId: 'p-reinhardt', answeredAt: new Date().toISOString() },
    ]);
    const { container } = render(<DeskRoster roster={richRoster()} />);

    const lines = container.querySelectorAll('[data-day-line]');
    // D7 — three quoted cards, and the answered note on top of them.
    expect(lines.length).toBeLessThanOrEqual(4);
    expect(
      Array.from(lines).map((l) => l.getAttribute('data-day-line')),
    ).toEqual(['card-vandersteen', 'card-wright', 'answered']);
    expect(
      container.querySelector('[data-day-line="answered"]')!.textContent,
    ).toBe('Nora Ellison replied last night — Reinhardt lake house');
  });

  it('sends “and N more below” to the claims grid', () => {
    const model = roster();
    model.groups[0].lines.push(
      ...['halvorsen', 'osterberg', 'ellison'].map((id) => ({
        ...model.groups[0].lines[0],
        engagementId: id,
        name: `${id} loft`,
      })),
    );
    model.groups[0].count = 4;
    const { container } = render(<DeskRoster roster={model} />);

    const more = container.querySelector('[data-day-line-more]')!;
    // Five cards, three quoted.
    expect(more.textContent).toBe('and 2 more below');
    expect(more).toHaveAttribute('href', '#desk-claims');
    expect(container.querySelector('#desk-claims')).not.toBeNull();
  });

  it('says the card’s own reason after the job it names', () => {
    const { container } = render(<DeskRoster roster={richRoster()} />);

    const quoted = container.querySelector('[data-day-line="card-wright"]')!;
    expect(quoted.textContent).toBe(
      'Wright apartment — New lead — respond by Aug 27',
    );
    expect(
      within(quoted as HTMLElement).getByRole('link', {
        name: 'Wright apartment — the card below',
      }),
    ).toHaveAttribute('href', '#roster-line-wright');
  });

  it('writes the sheet’s inline act, not a control box', () => {
    const { container } = render(<DeskRoster roster={roster()} />);

    const link = container.querySelector<HTMLElement>(
      '[data-desk-day-line] a[href^="#roster-line-"]',
    )!;
    expect(link.className).toContain('border-[color:var(--color-aged-oak)]');
    expect(link.className).toContain('text-inherit');
    expect(link.className).toContain('focus-visible:outline-2');
    expect(link.className).not.toMatch(/min-h-|rounded-|bg-\[/);
  });

  it('gives every inline act the sheet’s focus pair — the ring and the caret', () => {
    const { container } = render(<DeskRoster roster={roster()} />);

    const acts = Array.from(
      container.querySelectorAll<HTMLElement>('[data-desk-day-line] a'),
    );
    expect(acts.length).toBeGreaterThan(0);
    for (const act of acts) {
      expect(act.className).toContain('focus-visible:outline-2');
      expect(act.className).toContain("before:content-['‸']");
      expect(act.className).toContain('focus-visible:before:opacity-100');
      // The caret is drawn, never spoken: an explicit name is what keeps the
      // pseudo-content out of the accessible name.
      expect(act.getAttribute('aria-label')).toBeTruthy();
    }
  });
});

describe('DeskRoster — the facets (IA-11 / IA-12)', () => {
  // DocumentAction's click handler is async (it awaits the caller's onClick
  // after logging), so the facet's state update lands outside user-event's own
  // act() wrapper unless the click is wrapped here.
  async function toggle(label: string) {
    await act(async () => {
      await userEvent.setup().click(screen.getByRole('button', { name: label }));
    });
  }

  it('prints both acts on the head row, unpressed, with stable labels', () => {
    render(<DeskRoster roster={roster()} studioMembers={STUDIO} />);

    const needsMe = screen.getByRole('button', { name: 'Only what needs me' });
    const byPerson = screen.getByRole('button', { name: 'By person' });
    expect(needsMe).toHaveAttribute('aria-pressed', 'false');
    expect(byPerson).toHaveAttribute('aria-pressed', 'false');
  });

  it('keeps each label the same word once its facet is on', async () => {
    render(<DeskRoster roster={roster()} studioMembers={STUDIO} />);

    await toggle('Only what needs me');
    await toggle('By person');

    expect(
      screen.getByRole('button', { name: 'Only what needs me' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'By person' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('names the active facet in the head sentence, and drops it again', async () => {
    render(<DeskRoster roster={roster()} studioMembers={STUDIO} />);

    expect(
      screen.getByText('Every job · 3 live · 1 overdue'),
    ).toBeInTheDocument();

    await toggle('Only what needs me');
    expect(
      screen.getByText(
        'Every job · 3 live · 1 overdue · showing what needs you',
      ),
    ).toBeInTheDocument();

    await toggle('By person');
    expect(
      screen.getByText(
        'Every job · 3 live · 1 overdue · showing what needs you · by person',
      ),
    ).toBeInTheDocument();

    await toggle('Only what needs me');
    expect(
      screen.getByText('Every job · 3 live · 1 overdue · by person'),
    ).toBeInTheDocument();
  });

  it('leaves both halves exactly as they were with no facet on', () => {
    const { container } = render(
      <DeskRoster roster={roster()} studioMembers={STUDIO} />,
    );

    expect(container.querySelectorAll('[data-stage-tab]')).toHaveLength(1);
    expect(container.querySelector('[data-person-plate]')).toBeNull();
    expect(container.querySelectorAll('[data-claim-card]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-ledger-row]')).toHaveLength(1);
    expect(screen.getByText('Project · 1')).toBeInTheDocument();
  });

  it('keeps only the cards under “Only what needs me”', async () => {
    const model = roster();
    model.groups[0].lines[0].mark = null;
    model.groups[0].lines[0].needKind = null;
    const { container } = render(
      <DeskRoster roster={model} studioMembers={STUDIO} />,
    );

    await toggle('Only what needs me');

    expect(
      Array.from(container.querySelectorAll('[data-claim-card]')).map((el) =>
        el.getAttribute('data-claim-card'),
      ),
    ).toEqual(['vandersteen']);
    // The ledger half is hidden outright — the cards already ARE what needs
    // her, so narrowing them again would be a no-op that looked like a filter.
    expect(container.querySelectorAll('[data-ledger-row]')).toHaveLength(0);
    expect(container.querySelector('[data-stage-tab]')).toBeNull();
    expect(container.querySelector('[data-desk-rest-head]')).toBeNull();
  });

  it('prints the sentence, never an empty list, when nothing needs a hand', async () => {
    const model = roster();
    for (const group of model.groups) {
      for (const line of group.lines) {
        line.mark = null;
        line.needKind = null;
      }
    }
    const { container } = render(
      <DeskRoster roster={model} studioMembers={STUDIO} />,
    );

    await toggle('Only what needs me');

    expect(
      screen.getByText('Nothing needs your hand today.'),
    ).toBeInTheDocument();
    expect(container.querySelectorAll('[data-claim-card]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-ledger-row]')).toHaveLength(0);
    expect(container.querySelector('[data-stage-tab]')).toBeNull();
    // The walkthrough's anchor stays on the page in this state too.
    expect(
      container.querySelector('[data-tour-anchor="desk-folio"]'),
    ).not.toBeNull();
  });

  it('groups by designer_id under “By person”, unassigned under the principal', async () => {
    const { container } = render(
      <DeskRoster roster={roster()} studioMembers={STUDIO} />,
    );

    await toggle('By person');

    expect(container.querySelector('[data-stage-tab]')).toBeNull();
    const plates = Array.from(
      container.querySelectorAll<HTMLElement>('[data-person-plate]'),
    );
    // Two over the cards, then one over the at-rest half. The principal
    // leads; Vandersteen carries no designer_id, so its card is hers.
    expect(plates.map((plate) => plate.textContent)).toEqual([
      'Leah Hartwell · 1',
      'Anneke Sund · 1',
      'Leah Hartwell · 1',
    ]);
    expect(
      plates[0].parentElement!.querySelector('[data-claim-card="vandersteen"]'),
    ).not.toBeNull();
    expect(
      plates[1].parentElement!.querySelector('[data-claim-card="byrne"]'),
    ).not.toBeNull();
    expect(
      plates[2].parentElement!.querySelector('[data-ledger-row="reinhardt"]'),
    ).not.toBeNull();
  });

  it('never prints one id twice across the two halves', async () => {
    // Leah heads a card group and a ledger group at once, so the two plates
    // cannot share `roster-person-<id>`.
    const { container } = render(
      <DeskRoster roster={roster()} studioMembers={STUDIO} />,
    );

    await toggle('By person');

    const ids = Array.from(container.querySelectorAll('[id]')).map((el) =>
      el.getAttribute('id'),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives a person plate the rail and ink, never a stage pigment', async () => {
    const { container } = render(
      <DeskRoster roster={roster()} studioMembers={STUDIO} />,
    );

    await toggle('By person');

    for (const plate of container.querySelectorAll<HTMLElement>(
      '[data-person-plate]',
    )) {
      expect(plate.className).toContain('bg-[var(--doc-rail-stock)]');
      expect(plate.className).toContain('text-[var(--text-primary)]');
      expect(plate.className).not.toMatch(/bg-\[var\(--tab-/);
      expect(plate.className).not.toContain('text-white');
    }
  });

  it('keeps each job’s own stage wash when the Desk is grouped by person', async () => {
    const { container } = render(
      <DeskRoster roster={roster()} studioMembers={STUDIO} />,
    );

    await toggle('By person');

    const washOf = (selector: string) =>
      container
        .querySelector<HTMLElement>(`${selector} span.row-wash`)!
        .style.getPropertyValue('--wash');
    expect(washOf('[data-claim-card="byrne"]')).toBe('var(--wash-proposal)');
    expect(washOf('[data-claim-card="vandersteen"]')).toBe(
      'var(--wash-project)',
    );
    expect(washOf('[data-ledger-row="reinhardt"]')).toBe('var(--wash-project)');
  });

  it('composes the two facets', async () => {
    const model = roster();
    model.groups[0].lines[0].mark = null;
    model.groups[0].lines[0].needKind = null;
    const { container } = render(
      <DeskRoster roster={model} studioMembers={STUDIO} />,
    );

    await toggle('Only what needs me');
    await toggle('By person');

    const plates = Array.from(
      container.querySelectorAll<HTMLElement>('[data-person-plate]'),
    );
    expect(plates.map((plate) => plate.textContent)).toEqual([
      'Leah Hartwell · 1',
    ]);
    expect(container.querySelectorAll('[data-ledger-row]')).toHaveLength(0);
  });

  it('offers no “By person” act when no member of the studio can be named', () => {
    render(<DeskRoster roster={roster()} />);

    expect(
      screen.getByRole('button', { name: 'Only what needs me' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'By person' })).toBeNull();
  });

  it('writes no shadow and no padding switch on the head row', () => {
    const { container } = render(
      <DeskRoster roster={roster()} studioMembers={STUDIO} />,
    );

    for (const el of container.querySelectorAll('*')) {
      expect(el.className.toString()).not.toMatch(
        /(^|[\s:])(drop-)?shadow-/,
      );
    }
  });
});

describe('DeskRoster — R143, the Desk in two halves', () => {
  it('cards the two marked jobs and leaves the quiet one a ledger row', () => {
    const { container } = render(<DeskRoster roster={roster()} />);

    // D3's rank: Vandersteen is designer-owned and overdue (band 0), Byrne is
    // client-held (band 2).
    expect(
      Array.from(container.querySelectorAll('[data-claim-card]')).map((el) =>
        el.getAttribute('data-claim-card'),
      ),
    ).toEqual(['vandersteen', 'byrne']);
    expect(
      Array.from(container.querySelectorAll('[data-ledger-row]')).map((el) =>
        el.getAttribute('data-ledger-row'),
      ),
    ).toEqual(['reinhardt']);
  });

  it('heads the ledger half with its count', () => {
    render(<DeskRoster roster={roster()} />);

    expect(screen.getByText('At rest · 1 job')).toBeInTheDocument();
  });

  it('keeps the desk-folio tour anchor on the first card', () => {
    const { container } = render(<DeskRoster roster={roster()} />);

    expect(
      container
        .querySelector('[data-tour-anchor="desk-folio"]')!
        .getAttribute('data-claim-card'),
    ).toBe('vandersteen');
  });

  it('keeps the section’s testid and walkthrough anchor', () => {
    const { container } = render(<DeskRoster roster={roster()} />);
    const section = container.querySelector('[data-testid="desk-roster"]')!;

    expect(section).toHaveAttribute('data-tour-anchor', 'desk-needs-your-hand');
    expect(section.querySelector('#every-job')).not.toBeNull();
  });

  it('heads only the ledger half with stage plates', () => {
    const { container } = render(<DeskRoster roster={roster()} />);
    const grid = container.querySelector('#desk-claims')!;

    expect(container.querySelectorAll('[data-stage-tab]').length).toBeGreaterThan(0);
    expect(grid.querySelectorAll('[data-stage-tab]')).toHaveLength(0);
  });

  it('hides the ledger half under Only what needs me', async () => {
    const user = userEvent.setup();
    const { container } = render(<DeskRoster roster={roster()} />);

    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Only what needs me' }));
    });

    expect(container.querySelectorAll('[data-ledger-row]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-claim-card]')).toHaveLength(2);
    // IX18 — the label never changes with state; aria-pressed carries it.
    expect(
      screen.getByRole('button', { name: 'Only what needs me' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('regroups both halves by person under By person', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <DeskRoster roster={roster()} studioMembers={STUDIO} />,
    );

    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'By person' }));
    });

    // Leah is the principal: the unassigned Vandersteen card lands with her,
    // as does her own at-rest Reinhardt row; Anneke keeps her Byrne card.
    expect(container.querySelectorAll('[data-person-plate]').length).toBe(3);
    expect(container.querySelectorAll('[data-claim-card]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-ledger-row]')).toHaveLength(1);
  });
});

describe('DeskRoster — no shadow reaches either half', () => {
  it('writes no shadow utility on any element it prints', () => {
    const { container } = render(<DeskRoster roster={roster()} />);

    for (const el of container.querySelectorAll('*')) {
      expect(el.className.toString()).not.toMatch(/\bshadow-/);
      expect(el.className.toString()).not.toMatch(/\bdrop-shadow\b/);
    }
  });
});
