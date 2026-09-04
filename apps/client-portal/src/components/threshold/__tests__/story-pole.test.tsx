import { render, screen, within } from '@testing-library/react';

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

const SECTIONS = [
  { id: 'doorstep', label: 'You stand at the doorstep' },
  { id: 'key', label: 'You are reading the key' },
  { id: 'mat', label: 'You stand on the mat' },
];

function pole(sections = SECTIONS) {
  return <StoryPole phases={splitSpinePhases(VALE)} sections={sections} />;
}

describe('StoryPole — six graduations, and one caret that moves', () => {
  it('carries the anchor and the threshold unit', () => {
    render(pole());

    const root = screen.getByTestId('story-pole');
    expect(root).toHaveAttribute('id', 'story-pole');
    expect(root).toHaveAttribute('data-threshold-unit', 'story-pole');
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

  it('collapses to one dot per graduation for the narrow reading', () => {
    render(pole());

    expect(screen.getByTestId('story-pole-dots').children).toHaveLength(6);
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

  it('watches each named section when the runtime can', () => {
    const observe = jest.fn();
    const observer = window.IntersectionObserver;
    Object.defineProperty(window, 'IntersectionObserver', {
      writable: true,
      configurable: true,
      value: class {
        observe = observe;
        unobserve = jest.fn();
        disconnect = jest.fn();
      },
    });

    try {
      render(
        <>
          <div id="doorstep" />
          <div id="key" />
          <div id="mat" />
          {pole()}
        </>,
      );
      expect(observe).toHaveBeenCalledTimes(3);
    } finally {
      Object.defineProperty(window, 'IntersectionObserver', {
        writable: true,
        configurable: true,
        value: observer,
      });
    }
  });
});
