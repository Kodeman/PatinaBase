import { useState } from 'react';
import { fireEvent, render, within } from '@testing-library/react';
import type { PeopleView } from '../types';
import {
  PEOPLE_VIEW_GROUPS,
  PEOPLE_VIEW_KEYS,
  PeopleCompactSelector,
  PeopleDesktopRail,
  peopleViewFromParam,
} from '../view-shell';

const EXPECTED_GROUPS = [
  { key: 'directory', name: 'Directory', views: ['directory'] },
  {
    key: 'relationships',
    name: 'Relationships',
    views: ['threads', 'nurture', 'reviews'],
  },
  {
    key: 'practice',
    name: 'Practice',
    views: ['portfolio', 'outreach', 'your-eye'],
  },
] as const;

describe('People Room navigation', () => {
  it('groups all seven stable views in the desktop relationship index', () => {
    const onSelect = jest.fn();
    const { container } = render(
      <PeopleDesktopRail
        activeView="nurture"
        directoryCount={42}
        nudge={{ count: 2, name: 'Leah Morgan', since: '8 months' }}
        onSelect={onSelect}
      />,
    );

    const rail = container.querySelector<HTMLElement>(
      '[data-people-desktop-rail]',
    );
    expect(rail).not.toBeNull();
    expect(rail).toHaveClass('hidden', 'min-[1180px]:block');

    const groups = Array.from(
      rail!.querySelectorAll<HTMLElement>('[data-people-view-group]'),
    );
    expect(groups.map((group) => group.dataset.peopleViewGroup)).toEqual(
      EXPECTED_GROUPS.map((group) => group.key),
    );

    for (const expected of EXPECTED_GROUPS) {
      const group = rail!.querySelector<HTMLElement>(
        `[data-people-view-group="${expected.key}"]`,
      );
      expect(group).not.toBeNull();
      expect(
        within(group!).getByRole('heading', { name: expected.name }),
      ).toHaveClass('doc-type-meta');
      expect(
        Array.from(
          group!.querySelectorAll<HTMLElement>('[data-people-view-option]'),
        ).map((option) => option.dataset.peopleViewOption),
      ).toEqual([...expected.views]);
    }

    expect(
      within(rail!).getByRole('button', { name: 'Nurture' }),
    ).toHaveAttribute('aria-current', 'page');
    expect(
      within(rail!).getByRole('button', { name: 'Directory 42' }),
    ).toHaveClass('doc-type-control', 'min-h-11');

    const nudge = rail!.querySelector<HTMLButtonElement>(
      '[data-people-engine-nudge]',
    );
    expect(nudge).toHaveTextContent('2 people drifting');
    expect(nudge).toHaveTextContent(
      'Leah Morgan is the strongest dormant tie · 8 months.',
    );
    expect(nudge).not.toHaveClass('rounded-[8px]');
  });

  it('changes the current view through the compact disclosure and returns focus', () => {
    function Harness() {
      const [view, setView] = useState<PeopleView>('directory');
      return (
        <PeopleCompactSelector
          currentView={view}
          profileOpen={false}
          directoryCount={42}
          nudge={null}
          onSelect={setView}
        />
      );
    }

    const { container } = render(<Harness />);
    const root = container.querySelector<HTMLElement>(
      '[data-people-compact-selector]',
    );
    const trigger = container.querySelector<HTMLButtonElement>(
      '[data-people-selector-trigger]',
    );
    const panel = container.querySelector<HTMLElement>(
      '[data-people-selector-panel]',
    );

    expect(root).toHaveClass('min-[1180px]:hidden');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAccessibleName(
      'Choose People view. Current view: Directory',
    );
    expect(panel).toHaveAttribute('hidden');

    fireEvent.click(trigger!);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(panel).not.toHaveAttribute('hidden');
    expect(panel!.querySelectorAll('[data-people-view-group]')).toHaveLength(3);

    fireEvent.click(within(panel!).getByRole('button', { name: 'Reviews' }));

    expect(trigger).toHaveAccessibleName(
      'Choose People view. Current view: Reviews',
    );
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(panel).toHaveAttribute('hidden');
    expect(trigger).toHaveFocus();
    expect(root).toHaveAttribute('data-people-current-view', 'reviews');
  });

  it('closes the compact disclosure on Escape or an outside pointer', () => {
    const { container } = render(
      <PeopleCompactSelector
        currentView="directory"
        profileOpen={false}
        nudge={null}
        onSelect={jest.fn()}
      />,
    );
    const trigger = container.querySelector<HTMLButtonElement>(
      '[data-people-selector-trigger]',
    )!;
    const panel = container.querySelector<HTMLElement>(
      '[data-people-selector-panel]',
    )!;

    fireEvent.click(trigger);
    const threads = within(panel).getByRole('button', { name: 'Threads' });
    threads.focus();
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(panel).toHaveAttribute('hidden');
    expect(trigger).toHaveFocus();

    fireEvent.click(trigger);
    expect(panel).not.toHaveAttribute('hidden');
    fireEvent.pointerDown(document.body);
    expect(panel).toHaveAttribute('hidden');
    expect(trigger).toHaveFocus();
  });

  it('keeps every existing deep-link key mapped to the same People view', () => {
    const expected: PeopleView[] = [
      'directory',
      'threads',
      'nurture',
      'reviews',
      'portfolio',
      'outreach',
      'your-eye',
    ];

    expect(PEOPLE_VIEW_KEYS).toEqual(expected);
    expect(
      PEOPLE_VIEW_GROUPS.flatMap((group) =>
        group.views.map((view) => view.key),
      ),
    ).toEqual(expected);
    for (const key of expected) expect(peopleViewFromParam(key)).toBe(key);
    expect(peopleViewFromParam('unknown')).toBeNull();
    expect(peopleViewFromParam(null)).toBeNull();
  });
});
