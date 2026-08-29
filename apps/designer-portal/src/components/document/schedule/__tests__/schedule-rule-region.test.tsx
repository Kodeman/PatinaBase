import { act, fireEvent, render, screen } from '@testing-library/react';
import { ScheduleRuleRegion } from '../schedule-rule-region';
import {
  ScheduleNavProvider,
  useScheduleNav,
} from '../schedule-nav-context';

const mockSchedule: {
  resolved: { phases: { id: string; start: string; end: string }[] } | null;
  phases: { id: string; name: string; status: string }[];
} = {
  resolved: {
    phases: [{ id: 'p1', start: '2026-08-01', end: '2026-09-15' }],
  },
  phases: [{ id: 'p1', name: 'Schematic design', status: 'in_progress' }],
};

jest.mock('@patina/supabase', () => ({
  useResolvedSchedule: () => mockSchedule,
}));

jest.mock('../../project-schedule-handoff-mount', () => ({
  ProjectScheduleHandoffMount: () => <div>the drafting strip</div>,
}));

jest.mock('../../phase-advance-control', () => ({
  PhaseAdvanceControl: () => <div>advance the phase</div>,
}));

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: {
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
    regionFolded: jest.fn(),
  },
}));

const props = {
  engagementKind: 'project',
  projectId: 'proj-1',
  projectTitle: 'Vasquez Residence',
  projectStatus: 'active',
  phases: undefined,
  summary: 'Week 1 of 14 · Install ~Sep 2026',
};

/** The ledger's "Edit dates" — the Spine's side of the wire, from outside. */
function ArmEditFromTheLedger() {
  const { armEdit } = useScheduleNav();
  return (
    <button type="button" onClick={() => armEdit('p1')}>
      Edit dates
    </button>
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('the schedule frame region', () => {
  it('opens folded and states where the project stands', () => {
    render(
      <ScheduleNavProvider>
        <ScheduleRuleRegion {...props} />
      </ScheduleNavProvider>,
    );
    expect(
      screen.getByText('Week 1 of 14 · Install ~Sep 2026'),
    ).toBeInTheDocument();
    expect(screen.queryByText('the drafting strip')).not.toBeInTheDocument();
  });

  it('names the folded seam "Schedule dates", distinct from the ledger region head', () => {
    // SP-02/F35 — two regions on one paper stop sharing the name `Schedule`.
    render(
      <ScheduleNavProvider>
        <ScheduleRuleRegion {...props} />
      </ScheduleNavProvider>,
    );
    // Folded: the seam is the only name on show, and it is not `Schedule`.
    expect(screen.getByText('Schedule dates')).toBeInTheDocument();
    expect(screen.queryByText(/^Schedule$/)).not.toBeInTheDocument();

    // Unfolded: the ledger region head keeps the bare `Schedule` (the running
    // index still points at it), and the seam name is gone with the seam.
    fireEvent.click(screen.getByRole('button', { name: /Schedule dates/ }));
    expect(screen.getByText(/^Schedule$/)).toBeInTheDocument();
    expect(screen.queryByText('Schedule dates')).not.toBeInTheDocument();
  });

  it('keeps the phase-advance control visible while the schedule is folded', () => {
    // Advancing the phase is a lifecycle act, not a date edit. Inside a
    // default-folded body it was invisible on every visit — a workflow that
    // simply disappeared behind a seam.
    render(
      <ScheduleNavProvider>
        <ScheduleRuleRegion {...props} />
      </ScheduleNavProvider>,
    );
    expect(screen.queryByText('the drafting strip')).not.toBeInTheDocument();
    expect(screen.getByText('advance the phase')).toBeInTheDocument();
  });

  it('keeps it visible unfolded too, and drops it off an inactive project', () => {
    const { rerender } = render(
      <ScheduleNavProvider>
        <ScheduleRuleRegion {...props} />
      </ScheduleNavProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Schedule/ }));
    expect(screen.getByText('advance the phase')).toBeInTheDocument();

    rerender(
      <ScheduleNavProvider>
        <ScheduleRuleRegion {...props} projectStatus="completed" />
      </ScheduleNavProvider>,
    );
    expect(screen.queryByText('advance the phase')).not.toBeInTheDocument();
  });

  it('unfolds to the editor and its ledger', () => {
    render(
      <ScheduleNavProvider>
        <ScheduleRuleRegion {...props} />
      </ScheduleNavProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Schedule/ }));
    expect(screen.getByText('the drafting strip')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Adjust dates' }),
    ).toBeInTheDocument();
  });

  it('remembers the fold under its OWN key, never the ledger schedule key', () => {
    render(
      <ScheduleNavProvider>
        <ScheduleRuleRegion {...props} />
      </ScheduleNavProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Schedule/ }));
    expect(
      window.localStorage.getItem('patina:doc-fold:proj-1:schedule-rule'),
    ).toBe('0');
    expect(
      window.localStorage.getItem('patina:doc-fold:proj-1:schedule'),
    ).toBeNull();
  });

  it('unfolds when the ledger arms an edit on a folded schedule', () => {
    render(
      <ScheduleNavProvider>
        <ScheduleRuleRegion {...props} />
        <ArmEditFromTheLedger />
      </ScheduleNavProvider>,
    );
    expect(screen.queryByText('the drafting strip')).not.toBeInTheDocument();

    act(() => {
      screen.getByRole('button', { name: 'Edit dates' }).click();
    });

    // The strip is on the page, so the intent it was carrying has somewhere to
    // land — armed against an unmounted strip it would simply have expired.
    expect(screen.getByText('the drafting strip')).toBeInTheDocument();
  });

  it('carries the region-gap token as its own top margin, folded and open, and no other mt-/mb-', () => {
    const { container, rerender } = render(
      <ScheduleNavProvider>
        <ScheduleRuleRegion {...props} />
      </ScheduleNavProvider>,
    );

    const folded = container.querySelector('section[aria-label="Schedule frame"]');
    expect(folded).not.toBeNull();
    expect(folded).toHaveClass('mt-[var(--doc-region-gap)]');
    expect(
      folded!.className.split(/\s+/).filter((cls) => /^mt-/.test(cls)),
    ).toEqual(['mt-[var(--doc-region-gap)]']);
    expect(folded!.className).not.toMatch(/\bmb-/);
    // The folded rule steps to `mid` — `strong` is reserved for an open region.
    const foldedRule = folded!.querySelector('[data-rule-weight]');
    expect(foldedRule).toHaveAttribute('data-rule-weight', 'mid');

    fireEvent.click(screen.getByRole('button', { name: /Schedule/ }));
    rerender(
      <ScheduleNavProvider>
        <ScheduleRuleRegion {...props} />
      </ScheduleNavProvider>,
    );

    const open = container.querySelector('section[aria-label="Schedule frame"]');
    expect(open).not.toBeNull();
    expect(open).toHaveClass('mt-[var(--doc-region-gap)]');
    expect(
      open!.className.split(/\s+/).filter((cls) => /^mt-/.test(cls)),
    ).toEqual(['mt-[var(--doc-region-gap)]']);
    expect(open!.className).not.toMatch(/\bmb-/);
    const openRule = open!.querySelector('[data-rule-weight]');
    expect(openRule).toHaveAttribute('data-rule-weight', 'strong');
  });
});
