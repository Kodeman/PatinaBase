/**
 * Room View stage-bounds regression guard.
 *
 * BUG (prod, both projections): the rv-body two-column grid used a bare `1fr`
 * stage track (a "230px" rail column then a bare "1fr"), i.e. minmax(auto,1fr).
 * The stage children fill that track via `w-full`: Plan is an aspect-ratio
 * SVG with `h-auto` and NO width/height attrs; Orbit is a <canvas> that
 * carries an intrinsic `width` attribute (renderer.setSize writes it). A bare
 * `1fr`'s content-based `auto` minimum is inflated by either child's
 * min-content, so the track resolves FAR past the viewport (measured live:
 * `grid-template-columns: 230px 2664px` in a 2056px viewport → the SVG/canvas
 * render ~2662px wide and overflow the page). Both Plan and Orbit blow out.
 *
 * FIX: pin the stage track minimum to 0 — `minmax(0,1fr)` — so the flexible
 * track bounds the content instead of the content sizing the track (live A/B:
 * both stages then resolve to 836px, docScrollWidth == viewport, no overflow).
 *
 * jsdom performs no layout, so this cannot assert pixel overflow directly. It
 * guards the exact CSS contract that the live-DOM measurement proved: the
 * stage track must be min-content-decoupled, never a bare `1fr`.
 */

import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { RoomGeometryDocument } from '@patina/supabase';
import { RoomView } from '../room-view';
import { prototypeRoom } from '@/lib/room-view/__fixtures__/room-fixture';

jest.mock('@/lib/analytics', () => ({
  roomEvents: {
    roomOpened: jest.fn(),
    modeSwitched: jest.fn(),
    measureUsed: jest.fn(),
  },
}));

function parsedDoc(): RoomGeometryDocument {
  return {
    engagementId: 'eng-1',
    activeSection: 'discovery',
    parseStatus: 'parsed',
    documentClientName: 'Elena Vasquez',
    ownerClientName: 'Elena Vasquez',
    roomType: 'living_room',
    scannedAt: '2026-07-16T15:24:00Z',
    qualityGrade: 'good',
    coveragePercentage: 92,
  } as unknown as RoomGeometryDocument;
}

/** The rv-body two-column grid (the only grid carrying the 230px facts rail).
 *  Matched by className scan — a CSS attribute selector with literal `[` from
 *  the Tailwind arbitrary value does not parse reliably in jsdom. */
function stageGrid(container: HTMLElement): HTMLElement {
  const el = Array.from(container.querySelectorAll<HTMLElement>('div')).find(
    (d) => d.className.includes('grid-cols-[230px'),
  );
  if (!el) throw new Error('rv-body stage grid not found');
  return el;
}

describe('RoomView stage bounds', () => {
  it('sizes the stage track with minmax(0,1fr), never a bare 1fr', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <RoomView
          roomId="room-1"
          doc={parsedDoc()}
          geometry={prototypeRoom()}
          thicknessConvention
          isLoading={false}
        />
      </QueryClientProvider>,
    );

    const cls = stageGrid(container).className;

    // The unguarded track (bare 1fr === minmax(auto,1fr)) is the root cause —
    // it must NOT be present.
    expect(cls).not.toMatch(/grid-cols-\[230px_1fr\]/);

    // The stage track must pin its minimum to 0 so content can't size it.
    expect(cls).toMatch(/grid-cols-\[230px_minmax\(0,1fr\)\]/);
  });
});
