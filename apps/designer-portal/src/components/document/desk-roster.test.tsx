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

describe('DeskRoster — the Material Register', () => {
  it('binds each lifecycle stage as a flat paper sheet', () => {
    const { container } = render(<DeskRoster roster={roster()} />);
    const sheets = Array.from(
      container.querySelectorAll<HTMLElement>('[data-material-sheet]'),
    );

    expect(sheets).toHaveLength(2);
    expect(sheets.map((sheet) => sheet.dataset.rosterStage)).toEqual([
      'proposal',
      'project',
    ]);
    expect(sheets[0].getAttribute('style')).toContain(
      'border-inline-start-color: var(--color-clay)',
    );
    expect(sheets[1].getAttribute('style')).toContain(
      'border-inline-start-color: var(--color-terracotta)',
    );

    for (const sheet of sheets) {
      expect(sheet.querySelector('[data-sheet-edge]')).toHaveAttribute(
        'aria-hidden',
        'true',
      );
      expect(sheet.className).not.toContain('shadow');
    }
  });

  it('reserves the restrained priority treatment for urgent lines', () => {
    const { container } = render(<DeskRoster roster={roster()} />);
    const quiet = container.querySelector<HTMLElement>(
      '[data-roster-line="byrne"]',
    );
    const urgent = container.querySelector<HTMLElement>(
      '[data-roster-line="vandersteen"]',
    );

    expect(quiet).not.toHaveAttribute('data-roster-priority');
    expect(quiet?.className).not.toContain('bg-[var(--bg-warm)]');
    expect(urgent).toHaveAttribute('data-roster-priority', 'true');
    expect(urgent?.className).toContain('bg-[var(--bg-warm)]');
  });
});

describe('DeskRoster — the Handled Desk response', () => {
  it('gives pointer hover and descendant focus the same restrained response', () => {
    const { container } = render(<DeskRoster roster={roster()} />);
    const quiet = container.querySelector<HTMLElement>(
      '[data-roster-line="byrne"]',
    );
    const urgent = container.querySelector<HTMLElement>(
      '[data-roster-line="vandersteen"]',
    );

    expect(quiet).toHaveAttribute('data-roster-response', 'interaction');
    expect(quiet?.className).toContain('hover:bg-[var(--bg-muted)]');
    expect(quiet?.className).toContain('focus-within:bg-[var(--bg-muted)]');
    expect(quiet?.className).toContain(
      'hover:border-[var(--color-aged-oak)]',
    );
    expect(quiet?.className).toContain(
      'focus-within:border-[var(--color-aged-oak)]',
    );

    expect(urgent).toHaveAttribute('data-roster-response', 'interaction');
    expect(urgent?.className).toContain('bg-[var(--bg-warm)]');
    expect(urgent?.className).toContain(
      'hover:border-[var(--color-terracotta)]',
    );
    expect(urgent?.className).toContain(
      'focus-within:border-[var(--color-terracotta)]',
    );
  });

  it('moves the existing act only in response to hover or keyboard focus', () => {
    render(<DeskRoster roster={roster()} />);
    const acts = [
      screen.getByRole('link', { name: 'Follow up — Byrne remodel' }),
      screen.getByRole('button', {
        name: 'Send reminder — Vandersteen residence',
      }),
    ];

    for (const act of acts) {
      expect(act.className).toContain('group-hover:-translate-x-1');
      expect(act.className).toContain('group-focus-within:-translate-x-1');
      expect(act.className).toContain('motion-reduce:transform-none');
      expect(act.className).toContain('motion-reduce:transition-none');
      expect(act.className).not.toContain('animate-');
    }
  });

  it('adds no disclosure, row tab stop, clipping, or shadow', () => {
    const { container } = render(<DeskRoster roster={roster()} />);
    const lines = Array.from(
      container.querySelectorAll<HTMLElement>('[data-roster-line]'),
    );

    expect(container.querySelector('[aria-expanded]')).toBeNull();
    for (const line of lines) {
      expect(line).not.toHaveAttribute('tabindex');
      expect(line.className).not.toContain('overflow-hidden');
      expect(line.className).not.toContain('shadow');
      expect(line.className).not.toContain('animate-');
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
