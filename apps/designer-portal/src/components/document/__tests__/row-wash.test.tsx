import type { PointerEvent as ReactPointerEvent } from 'react';
import { render, screen } from '@testing-library/react';
import { RowWash, useRowWash, type RowWashTone } from '../row-wash';

const TONES: RowWashTone[] = [
  'brief',
  'discovery',
  'direction',
  'proposal',
  'project',
  'install',
  'clay',
  'golden',
  'terracotta',
];

type WashHandlers = ReturnType<typeof useRowWash>;

let captured: WashHandlers | null = null;

/** The host the lanes build: `.has-wash` on the row, the wash inside it, and
 *  the pointer handlers on the row rather than on the wash — the wash is
 *  `pointer-events: none`, so it never sees an event of its own. The handlers
 *  are captured here because jsdom's PointerEvent shim drops clientX/clientY,
 *  so the arithmetic under test has to be driven with the event React would
 *  have handed it. */
function WashedRow({ tone }: { tone: RowWashTone }) {
  captured = useRowWash();
  return (
    <div data-testid="row" className="has-wash" {...captured}>
      <RowWash tone={tone} />
      <span className="row-wash-score">Vandersteen</span>
    </div>
  );
}

/** jsdom gives every element a zero rect, so the row's origin has to be
 *  supplied for the subtraction to have anything to subtract. */
function stubRect(element: HTMLElement, left: number, top: number) {
  element.getBoundingClientRect = () =>
    ({
      left,
      top,
      right: left + 400,
      bottom: top + 40,
      width: 400,
      height: 40,
      x: left,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect;
}

function pointerAt(row: HTMLElement, clientX: number, clientY: number) {
  return { currentTarget: row, clientX, clientY } as unknown as ReactPointerEvent<HTMLElement>;
}

beforeEach(() => {
  captured = null;
});

describe('RowWash', () => {
  it('renders a decorative wash the accessibility tree never sees', () => {
    const { container } = render(<WashedRow tone="project" />);
    const wash = container.querySelector('.row-wash');
    expect(wash).not.toBeNull();
    expect(wash!.getAttribute('aria-hidden')).toBe('true');
    // The row's own words carry the meaning; the wash adds none.
    expect(screen.getByText('Vandersteen')).toBeTruthy();
  });

  it.each(TONES)('maps tone %s to its own pigment and its still variant', (tone) => {
    const { container } = render(<WashedRow tone={tone} />);
    const wash = container.querySelector('.row-wash') as HTMLElement;
    expect(wash.style.getPropertyValue('--wash')).toBe(`var(--wash-${tone})`);
    expect(wash.style.getPropertyValue('--wash-still')).toBe(`var(--wash-${tone}-still)`);
  });

  it('writes the contact point on the ROW as --ink-x/--ink-y in px', () => {
    const { getByTestId } = render(<WashedRow tone="clay" />);
    const row = getByTestId('row');
    stubRect(row, 100, 50);

    captured!.onPointerMove(pointerAt(row, 340, 68));

    expect(row.style.getPropertyValue('--ink-x')).toBe('240px');
    expect(row.style.getPropertyValue('--ink-y')).toBe('18px');
  });

  it('places the point on pointer enter too, so a fast pointer never sweeps from the centre', () => {
    const { getByTestId } = render(<WashedRow tone="clay" />);
    const row = getByTestId('row');
    stubRect(row, 0, 0);

    captured!.onPointerEnter(pointerAt(row, 12, 6));

    expect(row.style.getPropertyValue('--ink-x')).toBe('12px');
    expect(row.style.getPropertyValue('--ink-y')).toBe('6px');
  });
});
