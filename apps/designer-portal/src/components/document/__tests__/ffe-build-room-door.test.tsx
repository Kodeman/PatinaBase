/**
 * SQ-1891 F2 (repair of SQ-1825, WP-01.6): the FF&E head's Build room doors
 * ("Edit pieces & purchasing", "Add the missing prices") keep their route
 * under round 8. A plain press opens the sheet in place; a modifier or
 * middle press follows the link, as the per-room door already does.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { buildRoomDoor } from '../paper/chapters/ffe-work-room';
import { RegionHead } from '../region/region-head';
import { buildRoomHref } from '@/lib/document/pieces/build-room-url';

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: {
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
    regionFolded: jest.fn(),
  },
}));

const DOC = 'd1';

function renderDoors(workRoom?: jest.Mock) {
  return render(
    <RegionHead
      headingId="ffe-heading"
      name="FF&E"
      status="Two prices missing"
      surfaceKey="document"
      regionKey="ffe"
      actions={[
        {
          key: 'ffe-lead-price',
          label: 'Add the missing prices',
          ...buildRoomDoor(DOC, { lens: 'price', room: null }, workRoom),
        },
        {
          key: 'work-the-pieces',
          label: 'Edit pieces & purchasing',
          variant: 'secondary',
          ...buildRoomDoor(DOC, { lens: 'rough', room: null }, workRoom),
        },
      ]}
    />,
  );
}

const door = (name: string) => screen.getByRole('link', { name });

describe('a Build room door under round 8', () => {
  it('keeps the route on both head doors', () => {
    renderDoors(jest.fn());
    expect(door('Add the missing prices')).toHaveAttribute(
      'href',
      buildRoomHref(DOC, { lens: 'price', room: null }),
    );
    expect(door('Edit pieces & purchasing')).toHaveAttribute(
      'href',
      buildRoomHref(DOC, { lens: 'rough', room: null }),
    );
  });

  it('opens in place on a plain press, remembering the door pressed', () => {
    const workRoom = jest.fn();
    renderDoors(workRoom);
    const price = door('Add the missing prices');
    const pressed = fireEvent.click(price, { button: 0 });
    expect(pressed).toBe(false); // default prevented: no route change
    expect(workRoom).toHaveBeenCalledWith(null, 'price', price);

    const edit = door('Edit pieces & purchasing');
    fireEvent.click(edit, { button: 0 });
    expect(workRoom).toHaveBeenLastCalledWith(null, 'rough', edit);
  });

  it.each([
    ['meta', { metaKey: true }],
    ['ctrl', { ctrlKey: true }],
    ['shift', { shiftKey: true }],
    ['alt', { altKey: true }],
    ['middle', { button: 1 }],
  ])('follows the link on a %s press', (_name, init) => {
    const workRoom = jest.fn();
    renderDoors(workRoom);
    const edit = door('Edit pieces & purchasing');
    const pressed = fireEvent.click(edit, { button: 0, ...init });
    expect(workRoom).not.toHaveBeenCalled();
    expect(pressed).toBe(true); // nothing here stops the link
  });
});

describe('a Build room door on the legacy renderer', () => {
  it('is the route alone, with nothing in place', () => {
    expect(buildRoomDoor(DOC, { lens: 'rough', room: null }, undefined)).toEqual({
      href: buildRoomHref(DOC, { lens: 'rough', room: null }),
    });
  });

  // RegionHead now forwards `onClick` on a link entry. An entry with an href
  // and no onClick (every legacy and non-FF&E link entry) is unchanged: the
  // same anchor, and a press of any kind follows its route.
  it('leaves a link entry without onClick a plain link that follows its route', () => {
    render(
      <RegionHead
        headingId="approvals-heading"
        name="Approvals"
        status="Two decisions waiting"
        surfaceKey="document"
        regionKey="approvals"
        actions={[
          { key: 'lead-act', label: 'Approve', onClick: jest.fn() },
          { key: 'history-act', label: 'History', variant: 'tertiary', href: '/x' },
          {
            key: 'work-the-pieces',
            label: 'Edit pieces & purchasing',
            variant: 'secondary',
            ...buildRoomDoor(DOC, { lens: 'rough', room: null }, undefined),
          },
        ]}
      />,
    );
    for (const [name, href, variant] of [
      ['History', '/x', 'tertiary'],
      ['Edit pieces & purchasing', buildRoomHref(DOC, { lens: 'rough', room: null }), 'secondary'],
    ] as const) {
      const link = screen.getByRole('link', { name });
      expect(link.tagName).toBe('A');
      expect(link).toHaveAttribute('href', href);
      expect(link).toHaveAttribute('data-action-variant', variant);
      expect(fireEvent.click(link, { button: 0 })).toBe(true);
      expect(fireEvent.click(link, { button: 0, metaKey: true })).toBe(true);
    }
  });
});
