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
            mark: null,
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
              'Overdue 6 days — Invoice 1042 overdue — oldest due Aug 2 — send a reminder',
            mark: 'overdue',
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
  it('marks an overdue line at the left margin, and leaves a quiet one unmarked', () => {
    const { container } = render(<DeskRoster roster={roster()} />);

    const marks = Array.from(
      container.querySelectorAll('[data-roster-mark]'),
    ).map((m) => m.getAttribute('data-mark-tone'));
    expect(marks).toEqual([null, 'overdue']);
  });

  it('gives a setup chore a different stamp colour from a dated overdue item', () => {
    const model = roster();
    model.groups[0].lines[0].mark = 'setup';
    const { container } = render(<DeskRoster roster={model} />);

    const [setup, overdue] = Array.from(
      container.querySelectorAll<HTMLElement>('[data-roster-mark]'),
    );
    expect(setup.getAttribute('data-mark-tone')).toBe('setup');
    expect(overdue.getAttribute('data-mark-tone')).toBe('overdue');
    expect(setup.getAttribute('data-mark-color')).not.toBe(
      overdue.getAttribute('data-mark-color'),
    );
  });
});

describe('DeskRoster — the acts', () => {
  it('carries the receivable’s figure and age on the invoice line', () => {
    render(<DeskRoster roster={roster()} />);

    expect(
      screen.getByText(
        'Overdue 6 days — Invoice 1042 overdue — oldest due Aug 2 — send a reminder',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Send reminder')).toBeInTheDocument();
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
