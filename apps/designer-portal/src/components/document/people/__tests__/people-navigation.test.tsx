/**
 * US-28 (Kody, 2026-10-13) — Studio contacts matches the specimen: no left
 * index and no view selector in the Room. The views that index held stand in
 * three sub-rooms (Client relations · Studio marketing · The Engine), which
 * open from the dock's More and ⌘K at the `?view=<key>` address every view
 * always had. These pins hold the grouping, the address, and the sub-room's
 * own underline words.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import type { PeopleView } from '../types';
import {
  EngineNudgeLine,
  PEOPLE_SUB_ROOMS,
  PEOPLE_VIEW_KEYS,
  SubRoomFilters,
  peopleSubRoomOf,
  peopleViewFromParam,
} from '../view-shell';
import {
  PEOPLE_SUB_ROOM_HREF,
  PEOPLE_SUB_ROOM_SURFACES,
} from '@/lib/document/registry';

const EXPECTED_ROOMS = [
  {
    key: 'client-relations',
    name: 'Client relations',
    views: ['threads', 'reviews'],
  },
  {
    key: 'studio-marketing',
    name: 'Studio marketing',
    views: ['portfolio', 'outreach', 'your-eye'],
  },
  { key: 'the-engine', name: 'The Engine', views: ['nurture'] },
] as const;

describe('People sub-rooms', () => {
  it('groups the six non-directory views into the three named rooms', () => {
    expect(
      PEOPLE_SUB_ROOMS.map((room) => ({
        key: room.key,
        name: room.name,
        views: room.views.map((view) => view.key),
      })),
    ).toEqual(EXPECTED_ROOMS);
    expect(peopleSubRoomOf('directory')).toBeNull();
    for (const room of EXPECTED_ROOMS) {
      for (const view of room.views) {
        expect(peopleSubRoomOf(view)?.key).toBe(room.key);
      }
    }
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
    expect([...PEOPLE_VIEW_KEYS].sort()).toEqual([...expected].sort());
    for (const key of expected) expect(peopleViewFromParam(key)).toBe(key);
    expect(peopleViewFromParam('unknown')).toBeNull();
    expect(peopleViewFromParam(null)).toBeNull();
  });

  it('opens each room from More and ⌘K at the address its first view always had', () => {
    expect(PEOPLE_SUB_ROOM_SURFACES.map((s) => [s.key, s.label])).toEqual(
      EXPECTED_ROOMS.map((room) => [room.key, room.name]),
    );
    for (const room of EXPECTED_ROOMS) {
      expect(PEOPLE_SUB_ROOM_HREF[room.key]).toBe(
        `/people?view=${room.views[0]}`,
      );
    }
  });

  it("prints a room's views as pressed underline words, and none for a one-view room", () => {
    const onSelect = jest.fn();
    const relations = PEOPLE_SUB_ROOMS[0];
    const { unmount } = render(
      <SubRoomFilters room={relations} view="threads" onSelect={onSelect} />,
    );
    const group = screen.getByRole('group', { name: 'Client relations views' });
    expect(group).toHaveClass('filters');
    expect(
      screen.getByRole('button', { name: 'Correspondence' }),
    ).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Client reviews' }));
    expect(onSelect).toHaveBeenCalledWith('reviews');
    unmount();

    const { container } = render(
      <SubRoomFilters
        room={PEOPLE_SUB_ROOMS[2]}
        view="nurture"
        onSelect={onSelect}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("prints The Engine's one line naming the strongest dormant tie", () => {
    render(
      <EngineNudgeLine
        nudge={{ count: 2, name: 'Leah Morgan', since: '8 months' }}
      />,
    );
    expect(document.querySelector('[data-people-engine-nudge]')).toHaveTextContent(
      'Leah Morgan is the strongest dormant tie · 8 months.',
    );
  });
});
