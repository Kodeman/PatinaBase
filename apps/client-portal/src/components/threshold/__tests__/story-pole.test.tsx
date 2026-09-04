import { act, render, screen, within } from '@testing-library/react';

import { splitSpinePhases } from '@/components/making/making-spine';
import type { MilestoneDetail } from '@/types/project';

import { StoryPole } from '../story-pole';

/* Fixtures live in this file on purpose: jest's testMatch treats EVERY file
   under a __tests__ dir as a suite, so a shared fixtures module here would be
   collected and fail for having no tests. */
function phase(
  overrides: Partial<MilestoneDetail> &
    Pick<MilestoneDetail, 'id' | 'index' | 'title' | 'status'>,
): MilestoneDetail {
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
const VALE: MilestoneDetail[] = [
  phase({ id: 'ph1', index: 0, title: 'Discovery', phase: 'consultation', status: 'completed' }),
  phase({ id: 'ph2', index: 1, title: 'Design', phase: 'concept_development', status: 'completed' }),
  phase({ id: 'ph3', index: 2, title: 'Refinement', phase: 'design_refinement', status: 'completed' }),
  phase({ id: 'ph4', index: 3, title: 'Procurement', phase: 'procurement', status: 'in_progress' }),
  phase({ id: 'ph5', index: 4, title: 'Installation', phase: 'installation', status: 'upcoming' }),
  phase({ id: 'ph6', index: 5, title: 'Completion', phase: 'final_walkthrough', status: 'upcoming' }),
];

/**
 * A real project's phases: five main-lane chapters whose `phase_key` is null,
 * which is the shape that used to collapse the whole pole onto "Discovery".
 * One of them ("Site survey") names no client phase at all, so it stands under
 * its own name.
 */
const ASPEN: MilestoneDetail[] = [
  phase({
    id: 'a1',
    index: 0,
    title: 'Schematic Design',
    phase: '',
    status: 'completed',
    startDate: '2026-03-02',
    completionDate: '2026-03-27',
  }),
  phase({
    id: 'a2',
    index: 1,
    title: 'Design Development',
    phase: '',
    status: 'completed',
    startDate: '2026-04-01',
    completionDate: '2026-05-29',
  }),
  phase({
    id: 'a3',
    index: 2,
    title: 'Site survey',
    phase: '',
    status: 'in_progress',
    startDate: '2026-06-01',
    targetDate: '2026-06-30',
  }),
  phase({
    id: 'a4',
    index: 3,
    title: 'Installation & Styling',
    phase: 'installation',
    status: 'pending',
    targetDate: '2026-10-14',
  }),
  phase({
    id: 'a5',
    index: 4,
    title: 'Completion',
    phase: '',
    status: 'pending',
    startDate: '2026-10-20',
    targetDate: '2026-10-27',
  }),
];

const SECTIONS = [
  { id: 'doorstep', label: 'You stand at the doorstep' },
  { id: 'key', label: 'You are reading the key' },
  { id: 'mat', label: 'You stand on the mat' },
];

function pole(sections = SECTIONS) {
  return <StoryPole phases={splitSpinePhases(VALE)} sections={sections} />;
}

/** Swap in an observer whose callback this test can pull. */
function captureObserver() {
  const original = window.IntersectionObserver;
  let fire: ((entries: Array<{ isIntersecting: boolean; target: Element }>) => void) | null = null;

  Object.defineProperty(window, 'IntersectionObserver', {
    writable: true,
    configurable: true,
    value: class {
      observe = jest.fn();
      unobserve = jest.fn();
      disconnect = jest.fn();
      constructor(callback: (entries: unknown[]) => void) {
        fire = callback as typeof fire;
      }
    },
  });

  return {
    fire: (entries: Array<{ isIntersecting: boolean; target: Element }>) => fire?.(entries),
    observed: () => fire !== null,
    restore: () =>
      Object.defineProperty(window, 'IntersectionObserver', {
        writable: true,
        configurable: true,
        value: original,
      }),
  };
}

describe('StoryPole — a graduation per phase, in its own name', () => {
  function aspen() {
    return <StoryPole phases={splitSpinePhases(ASPEN)} sections={SECTIONS} />;
  }

  it('names every phase for itself, and never four times over', () => {
    render(aspen());

    const rail = screen.getByTestId('story-pole-rail');
    const names = within(rail)
      .getAllByRole('listitem')
      .map((item) => item.querySelector('b')?.textContent);

    expect(names).toEqual([
      'Design',
      'Design Refinement',
      'Site survey',
      'Installation',
      'Completion',
    ]);
    expect(new Set(names).size).toBe(names.length);
  });

  it('dates each graduation the way the pole speaks a span', () => {
    render(aspen());

    expect(screen.getByTestId('story-pole-span-a1')).toHaveTextContent('March');
    expect(screen.getByTestId('story-pole-span-a2')).toHaveTextContent('April–May');
    expect(screen.getByTestId('story-pole-span-a3')).toHaveTextContent('June');
    expect(screen.getByTestId('story-pole-span-a4')).toHaveTextContent('week of 12 October');
    expect(screen.getByTestId('story-pole-span-a5')).toHaveTextContent('October');
  });

  it('holds the open chapter, and gives one dot to each of the five phases', () => {
    render(aspen());

    const held = screen.getByTestId('story-pole-graduation-a3');
    expect(held).toHaveAttribute('data-held', 'true');
    expect(held).toHaveTextContent('the house stands here');

    const dots = Array.from(screen.getByTestId('story-pole-dots').children).map((dot) =>
      dot.getAttribute('data-dot'),
    );
    expect(dots).toEqual(['walked', 'walked', 'held', 'ahead', 'ahead']);
  });
});

describe('StoryPole — six graduations, and one caret that moves', () => {
  it('carries the anchor and is deliberately not a threshold unit', () => {
    render(pole());

    const root = screen.getByTestId('story-pole');
    expect(root).toHaveAttribute('id', 'story-pole');
    expect(root).not.toHaveAttribute('data-threshold-unit');
    expect(root).not.toHaveAttribute('data-dimmable');
  });

  it('rules one graduation per phase, in order', () => {
    render(pole());

    const rail = screen.getByTestId('story-pole-rail');
    const graduations = within(rail).getAllByRole('listitem');
    expect(graduations).toHaveLength(6);
    expect(graduations[0]).toHaveTextContent('Discovery');
    expect(graduations[5]).toHaveTextContent('Completion');
  });

  it('holds the open chapter in full ink, and says the house stands there', () => {
    render(pole());

    const held = screen.getByTestId('story-pole-graduation-ph4');
    expect(held).toHaveAttribute('data-held', 'true');
    expect(held).toHaveTextContent('the house stands here');

    expect(screen.getByTestId('story-pole-graduation-ph1')).not.toHaveAttribute('data-held');
  });

  it('collapses to one dot per graduation, walked, held and ahead', () => {
    render(pole());

    const dots = Array.from(screen.getByTestId('story-pole-dots').children).map((dot) =>
      dot.getAttribute('data-dot'),
    );
    expect(dots).toEqual(['walked', 'walked', 'walked', 'held', 'ahead', 'ahead']);
  });

  it('stands still, and says where she starts, without an IntersectionObserver', () => {
    const observer = window.IntersectionObserver;
    // @ts-expect-error — the guard exists precisely for runtimes without it.
    delete window.IntersectionObserver;

    try {
      render(pole());
      expect(screen.getByTestId('story-pole-here')).toHaveTextContent(
        'You stand at the doorstep',
      );
    } finally {
      Object.defineProperty(window, 'IntersectionObserver', {
        writable: true,
        configurable: true,
        value: observer,
      });
    }
  });

  it('moves the caret as she reads, and never the pole', () => {
    const io = captureObserver();

    try {
      render(
        <>
          <div id="doorstep" data-testid="s-doorstep" />
          <div id="key" data-testid="s-key" />
          <div id="mat" data-testid="s-mat" />
          {pole()}
        </>,
      );
      expect(io.observed()).toBe(true);

      act(() => {
        io.fire([{ isIntersecting: true, target: screen.getByTestId('s-mat') }]);
      });

      expect(screen.getByTestId('story-pole-here')).toHaveTextContent('You stand on the mat');
      // The pole is struck once and never re-struck.
      expect(screen.getByTestId('story-pole-graduation-ph4')).toHaveAttribute(
        'data-held',
        'true',
      );
      expect(screen.getByTestId('story-pole-graduation-ph3')).not.toHaveAttribute('data-held');
      expect(screen.getByTestId('story-pole-graduation-ph5')).not.toHaveAttribute('data-held');
    } finally {
      io.restore();
    }
  });
});
