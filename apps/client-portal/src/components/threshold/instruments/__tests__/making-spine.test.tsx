import { render, screen, within } from '@testing-library/react';

import type { MilestoneDetail } from '@/types/project';
import {
  MakingSpine,
  SpineFuture,
  SpineReceipt,
  orderReceipts,
  parseSpineDate,
  splitSpinePhases,
  startOfWeek,
} from '../making-spine';

/* Fixtures live in this file on purpose: jest's testMatch treats EVERY file
   under a __tests__ dir as a suite, so a shared fixtures module here would be
   collected and fail for having no tests. */

/** 5 August 2026 — the deck's "today". */
const TODAY = new Date(2026, 7, 5);

function phase(overrides: Partial<MilestoneDetail> & Pick<MilestoneDetail, 'id' | 'index' | 'title' | 'status'>): MilestoneDetail {
  return {
    progressPercentage: 0,
    checklist: [],
    documents: [],
    messages: [],
    tags: [],
    ...overrides,
  };
}

/** The Vale residence: three chapters closed, procurement open, October ahead. */
const VALE_PHASES: MilestoneDetail[] = [
  phase({
    id: 'ph-discovery',
    index: 0,
    title: 'Discovery',
    phase: 'consultation',
    status: 'completed',
    completionDate: '2026-03-12',
  }),
  phase({
    id: 'ph-design',
    index: 1,
    title: 'Three rooms concepted',
    phase: 'concept_development',
    status: 'completed',
    completionDate: '2026-05-30',
  }),
  phase({
    id: 'ph-refinement',
    index: 2,
    title: 'Design Refinement',
    phase: 'design_refinement',
    status: 'completed',
    completionDate: '2026-06-19',
  }),
  phase({
    id: 'ph-procurement',
    index: 3,
    title: 'Procurement',
    phase: 'procurement',
    status: 'in_progress',
    startDate: '2026-07-01',
    targetDate: '2026-09-30',
  }),
  phase({
    id: 'ph-installation',
    index: 4,
    title: 'Installation',
    phase: 'installation',
    status: 'upcoming',
    targetDate: '2026-10-15',
  }),
  phase({
    id: 'ph-completion',
    index: 5,
    title: 'The walkthrough',
    phase: 'final_walkthrough',
    status: 'upcoming',
    targetDate: '2026-10-29',
  }),
  // A concurrent workstream — its own story, and never on the main spine.
  phase({
    id: 'ph-millwork',
    index: 6,
    title: 'Millwork fabrication',
    phase: 'procurement',
    status: 'in_progress',
    tags: ['Concurrent workstream'],
  }),
];

function ink(row: HTMLElement): string | null {
  return row.querySelector('[data-spine-ink]')?.getAttribute('data-spine-ink') ?? null;
}

function cap(row: HTMLElement): string | null {
  return row.querySelector('[data-spine-cap]')?.getAttribute('data-spine-cap') ?? null;
}

function rule(row: HTMLElement): string | null {
  return row.querySelector('[data-spine-rule]')?.getAttribute('data-spine-rule') ?? null;
}

/** The testids of every addressable region, in document order. */
function regionOrder(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[data-testid]')).map(
    (node) => node.getAttribute('data-testid') as string,
  );
}

describe('MakingSpine — the settled past', () => {
  it('compresses each closed main-lane phase to one dated receipt', () => {
    render(<MakingSpine milestones={VALE_PHASES} today={TODAY} />);

    const receipts = screen.getAllByTestId('spine-receipt');
    expect(receipts).toHaveLength(3);

    // Client phase labels, not the designer's vocabulary.
    expect(receipts[0]).toHaveTextContent('Discovery closed');
    expect(receipts[0]).toHaveTextContent('Mar 12');
    expect(receipts[1]).toHaveTextContent('Design closed');
    expect(receipts[1]).toHaveTextContent('May 30');
    expect(receipts[2]).toHaveTextContent('Design Refinement closed');
    expect(receipts[2]).toHaveTextContent('Jun 19');
  });

  it('never prints the studio’s own phase naming on the client’s receipt', () => {
    render(<MakingSpine milestones={VALE_PHASES} today={TODAY} />);

    // `project_phases.name` is the DESIGNER's vocabulary — "Schematic Design",
    // "Construction Documentation". A receipt reading "Design closed ·
    // Schematic Design" hands AIA-practice terms to a homeowner.
    expect(screen.getAllByTestId('spine-receipt')[1].textContent).toBe(
      'May 30Design closed',
    );
    expect(screen.getAllByTestId('spine-receipt')[0].textContent).toBe(
      'Mar 12Discovery closed',
    );
  });

  it('carries a settled checklist as the closing fact when the data has one', () => {
    render(
      <MakingSpine
        milestones={[
          phase({
            id: 'ph-done',
            index: 0,
            title: 'Construction Documentation',
            phase: 'design_refinement',
            status: 'completed',
            completionDate: '2026-06-19',
            checklist: [
              { id: 'a', label: 'Drawings issued', completed: true },
              { id: 'b', label: 'Selections agreed', completed: true },
            ],
          }),
        ]}
        today={TODAY}
      />,
    );

    const receipt = screen.getByTestId('spine-receipt');
    expect(receipt).toHaveTextContent('Design Refinement closed');
    expect(receipt).toHaveTextContent('2 steps complete');
    expect(receipt).not.toHaveTextContent('Construction Documentation');
  });

  it('inks each receipt in its own phase colour', () => {
    render(<MakingSpine milestones={VALE_PHASES} today={TODAY} />);

    const receipts = screen.getAllByTestId('spine-receipt');
    expect(ink(receipts[0])).toBe('var(--phase-consultation)');
    expect(ink(receipts[1])).toBe('var(--phase-concept)');
    expect(ink(receipts[2])).toBe('var(--phase-refinement)');
  });

  it('merges executed instruments into the settled block at their dates', () => {
    render(
      <MakingSpine
        milestones={VALE_PHASES}
        today={TODAY}
        instrumentReceipts={[
          {
            id: 'doc-1',
            date: '2026-04-08',
            lead: 'Design services agreement executed',
            detail: '$18,000',
          },
        ]}
      />,
    );

    const leads = screen
      .getAllByTestId('spine-receipt')
      .map((row) => row.textContent ?? '');
    expect(leads).toHaveLength(4);
    // April sits between the March and May receipts, not at the end.
    expect(leads[1]).toContain('Design services agreement executed');
    expect(leads[2]).toContain('Design closed');
  });
});

describe('MakingSpine — the marker', () => {
  it('states where the client stands, in the open phase’s ink', () => {
    render(<MakingSpine milestones={VALE_PHASES} today={TODAY} />);

    const marker = screen.getByTestId('spine-marker');
    expect(marker).toHaveTextContent('You are here');
    expect(marker).toHaveTextContent('Procurement — the open chapter, July through September.');
    expect(marker).toHaveTextContent('Aug 5');
    expect(ink(marker)).toBe('var(--phase-procurement)');
  });

  it('falls back to project.currentPhase when no phase row is open', () => {
    const closedOnly = VALE_PHASES.filter((m) => m.status === 'completed');
    render(
      <MakingSpine milestones={closedOnly} currentPhase="procurement" today={TODAY} />,
    );

    const marker = screen.getByTestId('spine-marker');
    expect(marker).toHaveTextContent('Procurement — the open chapter.');
    expect(ink(marker)).toBe('var(--phase-procurement)');
  });

  it('refuses to call a studio’s phase name Discovery', () => {
    const closedOnly = VALE_PHASES.filter((m) => m.status === 'completed');
    render(
      <MakingSpine
        milestones={closedOnly}
        // project.currentPhase is `project_phases.name || phase_key`, so on a
        // real project it is usually the studio's free text. normalizePhaseSlug
        // answers 'consultation' for anything it cannot place — which printed
        // "Discovery" on a house mid-Procurement.
        currentPhase="Construction Documentation"
        today={TODAY}
      />,
    );

    const marker = screen.getByTestId('spine-marker');
    expect(marker).toHaveTextContent('You are here');
    expect(marker).not.toHaveTextContent('Discovery');
    expect(marker).not.toHaveTextContent('open chapter');
  });

  it('still reads a real phase key, and a client label, in the fallback', () => {
    const closedOnly = VALE_PHASES.filter((m) => m.status === 'completed');
    const { unmount } = render(
      <MakingSpine milestones={closedOnly} currentPhase="final_walkthrough" today={TODAY} />,
    );
    expect(screen.getByTestId('spine-marker')).toHaveTextContent(
      'Completion — the open chapter.',
    );
    unmount();

    render(<MakingSpine milestones={closedOnly} currentPhase="Discovery" today={TODAY} />);
    expect(screen.getByTestId('spine-marker')).toHaveTextContent(
      'Discovery — the open chapter.',
    );
  });

  it('stays mute rather than guessing a phase when the data names none', () => {
    render(<MakingSpine milestones={[]} />);

    const marker = screen.getByTestId('spine-marker');
    expect(marker).toHaveTextContent('You are here');
    expect(marker).not.toHaveTextContent('open chapter');
    // Not Discovery blue — normalizePhaseSlug is never called on nothing.
    expect(ink(marker)).toBe('var(--border-default)');
  });

  it('omits the date entirely until a hydrated today is handed in', () => {
    const { rerender } = render(<MakingSpine milestones={VALE_PHASES} />);
    const marker = screen.getByTestId('spine-marker');
    expect(marker).toHaveTextContent('Today');
    expect(marker).not.toHaveTextContent('Aug 5');

    rerender(<MakingSpine milestones={VALE_PHASES} today={TODAY} />);
    expect(screen.getByTestId('spine-marker')).toHaveTextContent('Aug 5');
  });
});

describe('MakingSpine — the sketched future', () => {
  it('softens each target date to the week it lands in', () => {
    render(<MakingSpine milestones={VALE_PHASES} today={TODAY} />);

    const future = screen.getAllByTestId('spine-future');
    expect(future).toHaveLength(2);
    // 15 October 2026 is a Thursday; its week opens Monday the 12th.
    expect(future[0]).toHaveTextContent('Week of');
    expect(future[0]).toHaveTextContent('Oct 12');
    expect(future[0]).toHaveTextContent('Installation');
    expect(future[1]).toHaveTextContent('Oct 26');
    expect(future[1]).toHaveTextContent('Completion');
  });

  it('sketches the client’s phase label and never the studio’s row name', () => {
    render(<MakingSpine milestones={VALE_PHASES} today={TODAY} />);

    // "The walkthrough" is `project_phases.name`; in production that column
    // holds things like "Construction Administration".
    expect(screen.getAllByTestId('spine-future')[1]).not.toHaveTextContent(
      'The walkthrough',
    );
  });

  it('draws the future dashed and the settled past solid', () => {
    render(<MakingSpine milestones={VALE_PHASES} today={TODAY} />);

    expect(rule(screen.getAllByTestId('spine-future')[0])).toBe('dashed');
    expect(rule(screen.getAllByTestId('spine-receipt')[0])).toBe('solid');
  });

  it('keeps an undated upcoming phase on the line without inventing a date', () => {
    render(
      <MakingSpine
        milestones={[
          phase({ id: 'a', index: 0, title: 'Procurement', phase: 'procurement', status: 'in_progress' }),
          phase({ id: 'b', index: 1, title: 'Installation', phase: 'installation', status: 'upcoming' }),
        ]}
        today={TODAY}
      />,
    );

    const row = screen.getByTestId('spine-future');
    expect(row).toHaveTextContent('Installation');
    expect(row).not.toHaveTextContent('Week of');
  });
});

describe('MakingSpine — the open chapter slot', () => {
  it('places children between the marker and the future, in order', () => {
    const { container } = render(
      <MakingSpine milestones={VALE_PHASES} today={TODAY} horizonDate="2026-10-15">
        <div data-testid="gate-one">A gate</div>
        <div data-testid="toll-one">A toll</div>
      </MakingSpine>,
    );

    const order = regionOrder(container);
    expect(order.indexOf('spine-marker')).toBeLessThan(order.indexOf('spine-open-chapter'));
    expect(order.indexOf('gate-one')).toBeLessThan(order.indexOf('toll-one'));
    expect(order.indexOf('spine-open-chapter')).toBeLessThan(
      order.indexOf('spine-future-block'),
    );
    expect(order.indexOf('spine-future-block')).toBeLessThan(order.indexOf('spine-horizon'));
  });

  it('renders no open-chapter region at all when nothing is handed in', () => {
    render(<MakingSpine milestones={VALE_PHASES} today={TODAY} />);
    expect(screen.queryByTestId('spine-open-chapter')).not.toBeInTheDocument();
  });
});

describe('MakingSpine — grace under thin data', () => {
  it('starts at the marker when no phase has closed', () => {
    const openOnly = VALE_PHASES.filter((m) => m.status !== 'completed');
    render(<MakingSpine milestones={openOnly} today={TODAY} />);

    expect(screen.queryByTestId('spine-settled')).not.toBeInTheDocument();
    expect(screen.queryByTestId('spine-receipt')).not.toBeInTheDocument();
    // The rule begins at the marker's node rather than dangling above it.
    expect(cap(screen.getByTestId('spine-marker'))).toBe('top');
  });

  it('ends after the open chapter when nothing is scheduled ahead', () => {
    const settledAndOpen = VALE_PHASES.filter((m) => m.status !== 'upcoming');
    render(
      <MakingSpine milestones={settledAndOpen} today={TODAY}>
        <div data-testid="gate-one">A gate</div>
      </MakingSpine>,
    );

    expect(screen.queryByTestId('spine-future-block')).not.toBeInTheDocument();
    // Children follow, so the marker's rule still runs down into them.
    expect(cap(screen.getByTestId('spine-marker'))).toBe('none');
  });

  it('caps both ends when the marker is the whole spine', () => {
    render(<MakingSpine milestones={[]} />);

    expect(screen.queryByTestId('spine-settled')).not.toBeInTheDocument();
    expect(screen.queryByTestId('spine-future-block')).not.toBeInTheDocument();
    expect(cap(screen.getByTestId('spine-marker'))).toBe('both');
  });

  it('renders exactly the phases the data carries — no ghost armature', () => {
    render(
      <MakingSpine
        milestones={[
          phase({
            id: 'only-1',
            index: 0,
            title: 'Discovery',
            phase: 'consultation',
            status: 'completed',
            completionDate: '2026-03-12',
          }),
          phase({
            id: 'only-2',
            index: 1,
            title: 'Design',
            phase: 'concept_development',
            status: 'in_progress',
          }),
        ]}
        today={TODAY}
      />,
    );

    expect(screen.getAllByTestId('spine-receipt')).toHaveLength(1);
    expect(screen.queryByTestId('spine-future-block')).not.toBeInTheDocument();
    expect(screen.getByTestId('spine-marker')).toHaveTextContent('Design — the open chapter.');
  });

  it('keeps concurrent workstreams off the main spine', () => {
    const { container } = render(<MakingSpine milestones={VALE_PHASES} today={TODAY} />);
    expect(within(container).queryByText(/Millwork fabrication/)).not.toBeInTheDocument();

    const { settled, current, future } = splitSpinePhases(VALE_PHASES);
    expect([...settled, ...(current ? [current] : []), ...future].map((p) => p.id)).not.toContain(
      'ph-millwork',
    );
  });
});

describe('MakingSpine — the horizon foot', () => {
  it('names the week when a target end date exists', () => {
    render(
      <MakingSpine milestones={VALE_PHASES} today={TODAY} horizonDate="2026-10-15" />,
    );

    expect(screen.getByTestId('spine-horizon')).toHaveTextContent(
      'If nothing changes, we walk through your finished rooms the week of October 12.',
    );
  });

  it('says nothing when the project carries no target end date', () => {
    render(<MakingSpine milestones={VALE_PHASES} today={TODAY} />);
    expect(screen.queryByTestId('spine-horizon')).not.toBeInTheDocument();
  });

  it('does not promise a walkthrough that has already been and gone', () => {
    render(
      <MakingSpine milestones={VALE_PHASES} today={TODAY} horizonDate="2026-06-01" />,
    );
    expect(screen.queryByTestId('spine-horizon')).not.toBeInTheDocument();
  });
});

describe('the exported pieces on their own', () => {
  it('SpineReceipt renders a dated mono one-liner', () => {
    render(
      <SpineReceipt
        id="r1"
        date="2026-06-19"
        lead="Design Refinement closed"
        detail="14 selections agreed"
        color="var(--phase-refinement)"
        today={TODAY}
      />,
    );

    const row = screen.getByTestId('spine-receipt');
    expect(row).toHaveTextContent('Jun 19');
    expect(row).toHaveTextContent('Design Refinement closed');
    expect(row).toHaveTextContent('14 selections agreed');
    expect(ink(row)).toBe('var(--phase-refinement)');
  });

  it('SpineReceipt drops the date column rather than printing a bad one', () => {
    render(<SpineReceipt id="r2" date="not-a-date" lead="Discovery closed" />);
    expect(screen.getByTestId('spine-receipt')).not.toHaveTextContent(/Invalid/);
  });

  it('SpineFuture spells the year once the target leaves this one', () => {
    render(
      <SpineFuture date="2027-02-10" lead="Installation" today={TODAY} />,
    );
    expect(screen.getByTestId('spine-future')).toHaveTextContent('Feb 8, 2027');
  });
});

describe('spine date handling', () => {
  it('reads a date-only string as a local day, not UTC midnight', () => {
    const parsed = parseSpineDate('2026-03-12');
    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(2);
    expect(parsed?.getDate()).toBe(12);
  });

  it('returns null for an unparseable date', () => {
    expect(parseSpineDate('whenever')).toBeNull();
    expect(parseSpineDate(undefined)).toBeNull();
  });

  it('opens the week on Monday, including for a Sunday', () => {
    // Sunday 11 October 2026 belongs to the week that opened Monday the 5th.
    expect(startOfWeek(new Date(2026, 9, 11)).getDate()).toBe(5);
    expect(startOfWeek(new Date(2026, 9, 12)).getDate()).toBe(12);
  });

  it('holds an undated receipt with its neighbours instead of sinking it', () => {
    const ordered = orderReceipts([
      { id: 'a', date: '2026-03-12', lead: 'Discovery closed' },
      { id: 'b', lead: 'Design closed' },
      { id: 'c', date: '2026-06-19', lead: 'Design Refinement closed' },
      { id: 'd', date: '2026-04-08', lead: 'Agreement executed' },
    ]);

    expect(ordered.map((entry) => entry.id)).toEqual(['a', 'b', 'd', 'c']);
  });
});
