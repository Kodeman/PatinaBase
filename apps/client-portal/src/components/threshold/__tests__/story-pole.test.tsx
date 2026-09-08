import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { splitSpinePhases } from '@/components/threshold/instruments/making-spine';
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
  { id: 'doorstep', label: 'You stand at the doorstep', short: 'the doorstep' },
  { id: 'key', label: 'You are reading the key', short: 'the whole house' },
  { id: 'mat', label: 'You stand on the mat', short: 'the mat' },
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

describe('StoryPole — the pole navigates', () => {
  const HOUSE = [
    { id: 'doorstep', label: 'You stand at the doorstep', short: 'the doorstep' },
    { id: 'letterbox', label: 'The letterbox', short: 'the letterbox' },
    { id: 'wall', label: 'What needs you', short: 'the wall' },
    { id: 'key', label: 'The whole house', short: 'the whole house' },
    { id: 'study', label: 'The study', short: 'The study' },
    { id: 'road', label: 'The road', short: 'the road' },
    { id: 'mat', label: 'You stand on the mat', short: 'the mat' },
  ];

  /** The house draws its first band as the study — installation's place (SF-03). */
  function house(sections = HOUSE, firstBandAnchor: string | null = 'study') {
    return (
      <StoryPole
        phases={splitSpinePhases(VALE)}
        sections={sections}
        firstBandAnchor={firstBandAnchor}
      />
    );
  }

  it('links a chapter that has a section, to that section', () => {
    render(house());

    expect(screen.getByTestId('story-pole-link-ph4')).toHaveAttribute('href', '#road');
    expect(screen.getByTestId('story-pole-link-ph5')).toHaveAttribute('href', '#study');
  });

  it('sends installation to the first room band and never to the key', () => {
    render(house());

    const links = screen
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'));
    expect(links).not.toContain('#key');
  });

  it('leaves installation plain when the page draws no band to send it to', () => {
    render(house(HOUSE, null));

    expect(screen.queryByTestId('story-pole-link-ph5')).not.toBeInTheDocument();
    expect(screen.getByTestId('story-pole-graduation-ph5')).toBeInTheDocument();
  });

  it('leaves a chapter with no section of its own as plain text', () => {
    render(house());

    for (const id of ['ph1', 'ph2', 'ph3', 'ph6']) {
      expect(screen.queryByTestId(`story-pole-link-${id}`)).not.toBeInTheDocument();
      expect(screen.getByTestId(`story-pole-graduation-${id}`)).toBeInTheDocument();
    }
  });

  it('never links a chapter whose section is not on this page', () => {
    // A house with no road and no key: neither chapter has a place to stand.
    render(
      house([
        { id: 'doorstep', label: 'You stand at the doorstep' },
        { id: 'mat', label: 'You stand on the mat' },
      ]),
    );

    expect(screen.queryByTestId('story-pole-link-ph4')).not.toBeInTheDocument();
    expect(screen.queryByTestId('story-pole-link-ph5')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('every link it does draw points at a section the page gave it', () => {
    render(house());

    const ids = new Set(HOUSE.map((section) => `#${section.id}`));
    for (const link of screen.getAllByRole('link')) {
      expect(ids.has(link.getAttribute('href') ?? '')).toBe(true);
    }
  });

  it('keeps the caret a reading mark, not a control', () => {
    render(house());

    const caret = screen.getByTestId('story-pole-caret');
    expect(caret).toHaveAttribute('aria-hidden', 'true');
    expect(caret.tagName).toBe('SPAN');
    expect(caret).not.toHaveAttribute('href');
    expect(caret.closest('a')).toBeNull();
    expect(caret.closest('button')).toBeNull();
  });

  it('strikes the held mark into the same column as every other graduation', () => {
    render(house());

    const marks = screen
      .getAllByTestId(/^story-pole-graduation-/)
      .map((li) => li.querySelector('span[aria-hidden="true"]')!)
      .filter(Boolean);
    expect(marks.length).toBeGreaterThan(1);

    // Same left offset and same width on every mark, so every label starts at
    // the same gap off the rail and the held one cannot run into its own word.
    for (const mark of marks) {
      expect(mark.className).toContain('-left-4');
      expect(mark.className).toContain('w-[9px]');
      expect(mark.className).not.toContain('w-5');
    }
  });

  it('offers a one-line bar that says where she is and opens the same list', async () => {
    const user = userEvent.setup();
    render(house());

    const toggle = screen.getByTestId('story-pole-toggle');
    // The bar supplies the verb, so the section gives it a noun and nothing
    // more — never "You are in: You stand at the doorstep".
    expect(toggle).toHaveTextContent('You are in: the doorstep');
    expect(toggle).not.toHaveTextContent('You are in: You stand');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', 'story-pole-rail');
    expect(screen.getByTestId('story-pole-rail')).toHaveAttribute('id', 'story-pole-rail');
    expect(screen.getByTestId('story-pole')).toHaveAttribute('data-open', 'false');

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('story-pole')).toHaveAttribute('data-open', 'true');
    expect(screen.getByTestId('story-pole-rail').className).not.toContain('max-[600px]:hidden');

    await user.click(toggle);
    expect(screen.getByTestId('story-pole')).toHaveAttribute('data-open', 'false');
    expect(screen.getByTestId('story-pole-rail').className).toContain('max-[600px]:hidden');
  });

  it('says where she is on the bar as the caret moves', () => {
    const io = captureObserver();

    try {
      render(
        <>
          <div id="doorstep" data-testid="s-doorstep" />
          <div id="letterbox" data-testid="s-letterbox" />
          <div id="wall" data-testid="s-wall" />
          <div id="key" />
          <div id="study" />
          <div id="road" />
          <div id="mat" />
          {house()}
        </>,
      );

      act(() => {
        io.fire([{ isIntersecting: true, target: screen.getByTestId('s-wall') }]);
      });

      expect(screen.getByTestId('story-pole-toggle')).toHaveTextContent(
        'You are in: the wall',
      );
      // The desktop rail keeps the whole sentence: it prints on its own line
      // with no "You are in:" ahead of it.
      expect(screen.getByTestId('story-pole-here')).toHaveTextContent('What needs you');
    } finally {
      io.restore();
    }
  });

  it('shuts the bar behind a chapter she jumps to', async () => {
    const user = userEvent.setup();
    render(house());

    await user.click(screen.getByTestId('story-pole-toggle'));
    expect(screen.getByTestId('story-pole')).toHaveAttribute('data-open', 'true');

    await user.click(screen.getByTestId('story-pole-link-ph4'));
    expect(screen.getByTestId('story-pole')).toHaveAttribute('data-open', 'false');
  });
});
