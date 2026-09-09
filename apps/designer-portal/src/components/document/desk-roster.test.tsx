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
    heading: 'Every job · 2 live · 1 overdue',
    overdueLine: 'One thing is overdue — Vandersteen.',
    liveCount: 2,
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
        count: 1,
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
      screen.getByText('Every job · 2 live · 1 overdue'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('One thing is overdue — Vandersteen.'),
    ).toBeInTheDocument();
  });
});

describe('DeskRoster — the density rule', () => {
  it('prints one line per job under headings that never fold', () => {
    const { container } = render(<DeskRoster roster={roster()} />);

    expect(container.querySelectorAll('[data-roster-line]')).toHaveLength(2);
    expect(screen.getByText('Proposal · 1')).toBeInTheDocument();
    expect(screen.getByText('Project · 1')).toBeInTheDocument();
    // Nothing folded on first paint: no disclosure control, nothing hidden.
    expect(container.querySelector('[aria-expanded]')).toBeNull();
    expect(container.querySelector('[hidden]')).toBeNull();
  });

  it('lets a long job name wrap instead of widening the page (390)', () => {
    // A flex child's min-width is auto, so an unbreakable name sets the row's
    // minimum width and the whole Desk scrolls sideways at 390. `min-w-0` plus
    // an overflow-wrap lets it WRAP — never truncate, which the sheet forbids.
    const { container } = render(<DeskRoster roster={roster()} />);
    const names = container.querySelectorAll('[data-roster-name]');
    expect(names).toHaveLength(2);
    for (const name of names) {
      expect(name.className).toContain('min-w-0');
      expect(name.className).toContain('[overflow-wrap:anywhere]');
      expect(name.className).not.toContain('truncate');
      expect(name.className).not.toContain('whitespace-nowrap');
    }
    // and the sentence beside it can still give the name its room.
    for (const line of container.querySelectorAll('[data-roster-line]')) {
      expect(line.querySelector('p')!.className).toContain('min-w-0');
    }
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
  it('marks every job that needs a hand, and leaves a job with no need unmarked', () => {
    const model = roster();
    model.groups[0].lines[0].mark = null;
    model.groups[0].lines[0].needKind = null;
    const { container } = render(<DeskRoster roster={model} />);

    const marks = Array.from(
      container.querySelectorAll('[data-roster-mark]'),
    ).map((m) => m.getAttribute('data-mark-tone'));
    expect(marks).toEqual([null, 'urgent']);
  });

  it('gives a quiet need a different stamp colour from a red-letter one', () => {
    const { container } = render(<DeskRoster roster={roster()} />);

    const [quiet, urgent] = Array.from(
      container.querySelectorAll<HTMLElement>('[data-roster-mark]'),
    );
    expect(quiet.getAttribute('data-mark-tone')).toBe('quiet');
    expect(urgent.getAttribute('data-mark-tone')).toBe('urgent');
    expect(quiet.getAttribute('data-mark-color')).not.toBe(
      urgent.getAttribute('data-mark-color'),
    );
  });
});

describe('DeskRoster — the acts', () => {
  it('carries the receivable’s figure and age on the invoice line', () => {
    render(<DeskRoster roster={roster()} />);

    const overdue = screen.getByText(/Overdue 6 days/);
    expect(overdue).toHaveTextContent('$17,500');
    expect(overdue).toHaveTextContent('oldest due Aug 2');
    expect(screen.getByText('Send reminder')).toBeInTheDocument();
  });

  it('names the job on every act, so eleven `Open the job`s are eleven acts', () => {
    render(<DeskRoster roster={roster()} />);

    expect(
      screen.getByRole('button', { name: 'Send reminder — Vandersteen residence' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Follow up — Byrne remodel' }),
    ).toBeInTheDocument();
  });

  it('adds no region landmark per stage group', () => {
    const { container } = render(<DeskRoster roster={roster()} />);
    // The roster is one region; seven stage headings must not become seven
    // more landmarks nested inside its action group.
    expect(container.querySelectorAll('section')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Proposal · 1' })).toBeInTheDocument();
  });

  it('opens the job from the line, and prints the job’s own act at the right', () => {
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

    expect(screen.getByText('Open the job')).toBeInTheDocument();
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
});

describe('DeskRoster — the stage tabs (R126)', () => {
  it('prints each stage head as a plate in its own pigment', () => {
    const { container } = render(<DeskRoster roster={roster()} />);

    const proposal = container.querySelector('[data-stage-tab="proposal"]')!;
    const project = container.querySelector('[data-stage-tab="project"]')!;
    expect(proposal.className).toContain('bg-[var(--tab-proposal)]');
    expect(project.className).toContain('bg-[var(--tab-project)]');
    // A plate, not a band: it hugs its own words and nothing sits behind the
    // rows below it.
    expect(proposal.className).toContain('inline-flex');
    expect(proposal.className).toContain('text-white');
    expect(proposal.textContent).toBe('Proposal · 1');
    // The mockup's .stage-head letter-spacing.
    expect(proposal.className).toContain('tracking-[0.1em]');
  });

  it('ends each roster row on the solid hairline, never a dashed one', () => {
    // Dashed goes back to meaning “not filled in” and appears nowhere
    // (globals.css, R126). .doc-rule-hair spends --rule-hair; last:border-b-0
    // still wins on specificity, so the last line in a stage carries none.
    const { container } = render(<DeskRoster roster={roster()} />);

    for (const row of container.querySelectorAll<HTMLElement>('[data-roster-line]')) {
      expect(row.className).toContain('doc-rule-hair');
      expect(row.className).toContain('last:border-b-0');
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
        { ...roster().groups[0].lines[0], engagementId: `job-${i}`, stage: key },
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
  it('gives every row a wash in its stage’s own pigment', () => {
    const { container } = render(<DeskRoster roster={roster()} />);

    const rows = Array.from(
      container.querySelectorAll<HTMLElement>('[data-roster-line]'),
    );
    expect(rows).toHaveLength(2);
    const tones = rows.map((row) => {
      expect(row.className).toContain('has-wash');
      const wash = row.querySelector<HTMLElement>('span.row-wash')!;
      // First child: the wash paints over the ground and under every word.
      expect(row.firstElementChild).toBe(wash);
      expect(wash.getAttribute('aria-hidden')).toBe('true');
      return wash.style.getPropertyValue('--wash');
    });
    expect(tones).toEqual(['var(--wash-proposal)', 'var(--wash-project)']);
  });

  it('draws exactly one clay line under the job name — the wash’s own score', () => {
    render(<DeskRoster roster={roster()} />);

    const name = screen.getByRole('link', { name: 'Vandersteen residence' });
    expect(name.className).toContain('row-wash-score');
    // The .row-wash-score ::after in globals.css is the only clay line. A
    // text-decoration hover path would draw a second one under the same word.
    expect(name.className).not.toMatch(/decoration-\[var\(--color-clay\)\]/);
  });

  it('leaves the act as the row’s own focusable control', () => {
    render(<DeskRoster roster={roster()} />);

    expect(
      screen.getByRole('button', { name: 'Send reminder — Vandersteen residence' }),
    ).toBeInTheDocument();
  });
});

describe('DeskRoster — the marks are unchanged by the wash', () => {
  it('keeps terracotta for urgent and dusty blue for quiet', () => {
    const { container } = render(<DeskRoster roster={roster()} />);

    const [quiet, urgent] = Array.from(
      container.querySelectorAll<HTMLElement>('[data-roster-mark]'),
    );
    expect(quiet.getAttribute('data-mark-color')).toBe(
      'var(--color-dusty-blue)',
    );
    expect(urgent.getAttribute('data-mark-color')).toBe(
      'var(--color-terracotta)',
    );
  });
});

describe('DeskRoster — no shadow reaches the roster', () => {
  it('writes no shadow utility on any element it prints', () => {
    const { container } = render(<DeskRoster roster={roster()} />);

    for (const el of container.querySelectorAll('*')) {
      expect(el.className.toString()).not.toMatch(/(^|[\s:])(drop-)?shadow-/);
    }
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
      dueOn: '2026-08-27',
      needText: 'New lead — respond by Aug 27',
      client: 'Marcus Wright',
      projectId: null,
    };
    model.groups[1].lines.push({
      ...model.groups[1].lines[0],
      engagementId: 'cedar',
      name: 'Cedar Lane Study',
      overdueText: null,
      overdue: { isOverdue: false, days: 0 },
      needKind: 'task_due',
      mark: 'quiet',
      client: 'Nora Ellison',
      projectId: 'p-cedar',
      act: { label: 'Open the job', href: '/doc/cedar' },
    });
    model.groups[1].count = 2;
    model.liveCount = 3;
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

  it('names the overdue job as an act into its own row, the clause in the red letter’s ink', () => {
    const { container } = render(<DeskRoster roster={roster()} />);

    const band = container.querySelector('[data-desk-day-line]')!;
    const link = within(band as HTMLElement).getByRole('link', {
      name: 'Vandersteen residence — the row below',
    });
    expect(link).toHaveAttribute('href', '#roster-line-vandersteen');
    expect(container.querySelector('#roster-line-vandersteen')).toHaveAttribute(
      'data-roster-line',
      'vandersteen',
    );

    const clause = band.querySelector('[data-day-line-overdue]')!;
    expect(clause.className).toContain('var(--color-terracotta-ink)');
    expect(clause.textContent).toMatch(/^ — project, overdue \d+ days?$/);
    // The sentence above the band is untouched — the head count, the sentence
    // and the row mark stay three legible levels of one fact.
    expect(
      screen.getByText('One thing is overdue — Vandersteen.'),
    ).toBeInTheDocument();
  });

  it('carries every line into a row that is already on the page', () => {
    mockAnsweredNotes.mockReturnValue([
      { projectId: 'p-cedar', answeredAt: new Date().toISOString() },
    ]);
    const { container } = render(<DeskRoster roster={richRoster()} />);

    const band = container.querySelector('[data-desk-day-line]')!;
    const links = Array.from(band.querySelectorAll('a[href^="#roster-line-"]'));
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      const id = link.getAttribute('href')!.slice(1);
      expect(container.querySelector(`[id="${id}"]`)).toHaveAttribute(
        'data-roster-line',
      );
    }
  });

  it('says at most three things, and names the client who replied', () => {
    mockAnsweredNotes.mockReturnValue([
      { projectId: 'p-cedar', answeredAt: new Date().toISOString() },
    ]);
    const { container } = render(<DeskRoster roster={richRoster()} />);

    const lines = container.querySelectorAll('[data-day-line]');
    expect(lines.length).toBeLessThanOrEqual(3);
    expect(Array.from(lines).map((l) => l.getAttribute('data-day-line'))).toEqual([
      'overdue',
      'lead',
      'answered',
    ]);
    expect(
      container.querySelector('[data-day-line="answered"]')!.textContent,
    ).toBe('Nora Ellison replied last night — Cedar Lane Study');
  });

  it('sends “and N more below” to the first stage plate', () => {
    const { container } = render(<DeskRoster roster={roster()} />);

    const more = container.querySelector('[data-day-line-more]')!;
    expect(more.textContent).toBe('and 1 more below');
    expect(more).toHaveAttribute('href', '#roster-stage-proposal');
    expect(
      container.querySelector('[data-stage-tab="proposal"]'),
    ).toHaveAttribute('id', 'roster-stage-proposal');
  });

  it('names the person she is keeping waiting on the lead line', () => {
    const { container } = render(<DeskRoster roster={richRoster()} />);

    const lead = container.querySelector('[data-day-line="lead"]')!;
    expect(lead.textContent).toBe(
      'Marcus Wright · new lead — respond by 27 August',
    );
    expect(
      within(lead as HTMLElement).getByRole('link', {
        name: 'Marcus Wright — the row below',
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
      screen.getByText('Every job · 2 live · 1 overdue'),
    ).toBeInTheDocument();

    await toggle('Only what needs me');
    expect(
      screen.getByText(
        'Every job · 2 live · 1 overdue · showing what needs you',
      ),
    ).toBeInTheDocument();

    await toggle('By person');
    expect(
      screen.getByText(
        'Every job · 2 live · 1 overdue · showing what needs you · by person',
      ),
    ).toBeInTheDocument();

    await toggle('Only what needs me');
    expect(
      screen.getByText('Every job · 2 live · 1 overdue · by person'),
    ).toBeInTheDocument();
  });

  it('leaves the stage plates exactly as they were with no facet on', () => {
    const { container } = render(
      <DeskRoster roster={roster()} studioMembers={STUDIO} />,
    );

    expect(container.querySelectorAll('[data-stage-tab]')).toHaveLength(2);
    expect(container.querySelector('[data-person-plate]')).toBeNull();
    expect(container.querySelectorAll('[data-roster-line]')).toHaveLength(2);
    expect(screen.getByText('Proposal · 1')).toBeInTheDocument();
    expect(screen.getByText('Project · 1')).toBeInTheDocument();
  });

  it('keeps only marked rows under “Only what needs me”', async () => {
    const model = roster();
    model.groups[0].lines[0].mark = null;
    model.groups[0].lines[0].needKind = null;
    const { container } = render(
      <DeskRoster roster={model} studioMembers={STUDIO} />,
    );

    await toggle('Only what needs me');

    const rows = Array.from(container.querySelectorAll('[data-roster-line]'));
    expect(rows.map((row) => row.getAttribute('data-roster-line'))).toEqual([
      'vandersteen',
    ]);
    // A stage with nothing left in it prints no plate at all.
    expect(container.querySelector('[data-stage-tab="proposal"]')).toBeNull();
    expect(screen.getByText('Project · 1')).toBeInTheDocument();
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
    expect(container.querySelectorAll('[data-roster-line]')).toHaveLength(0);
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
    // The principal leads; Vandersteen carries no designer_id, so it is hers.
    expect(plates.map((plate) => plate.textContent)).toEqual([
      'Leah Hartwell · 1',
      'Anneke Sund · 1',
    ]);
    const leah = plates[0].parentElement!;
    expect(
      leah.querySelector('[data-roster-line="vandersteen"]'),
    ).not.toBeNull();
    const anneke = plates[1].parentElement!;
    expect(anneke.querySelector('[data-roster-line="byrne"]')).not.toBeNull();
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

  it('keeps each row’s own stage wash when the roster is grouped by person', async () => {
    const { container } = render(
      <DeskRoster roster={roster()} studioMembers={STUDIO} />,
    );

    await toggle('By person');

    const washOf = (id: string) =>
      container
        .querySelector<HTMLElement>(`[data-roster-line="${id}"] span.row-wash`)!
        .style.getPropertyValue('--wash');
    expect(washOf('byrne')).toBe('var(--wash-proposal)');
    expect(washOf('vandersteen')).toBe('var(--wash-project)');
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
