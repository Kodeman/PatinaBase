import { render, screen } from '@testing-library/react';
import type { DeskRoster as DeskRosterModel } from '@/lib/document/desk-roster-derivation';
import { DeskRoster } from './desk-roster';

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

jest.mock('@/components/document/command-bar', () => ({
  openLedger: jest.fn(),
}));

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
      lines: [{ ...roster().groups[0].lines[0], engagementId: `job-${i}` }],
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
