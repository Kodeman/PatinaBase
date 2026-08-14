/**
 * useArmedBarFocus — the Spine → Rule "Edit dates" focus, across the pin
 * remount (B3 review blocker).
 *
 * The failure this pins: `armEdit` starts a smooth scroll, the sentinel
 * re-enters the viewport partway through, the IntersectionObserver flips
 * `pinned`, and ScheduleRule's pinned/unpinned ternary unmounts and remounts
 * every bar. A focus applied once, on the next frame, lands on an element that
 * is about to be discarded — and nothing focuses its replacement.
 *
 * The harness mirrors rule-phase-bar.test.tsx's remount technique: the hook
 * lives in a component that survives, and the "bar" beneath it carries a React
 * key we bump to force a genuine unmount/remount, exactly as the pin ternary
 * does. `mounted` additionally models a phase the Rule cannot draw at all.
 */

import { useState } from 'react';
import { render, screen, act } from '@testing-library/react';
import { useArmedBarFocus, ARMED_FOCUS_EXPIRY_MS } from '../use-armed-bar-focus';

const PHASE = 'phase-1';

let armFromHarness: (phaseId: string) => void;

function Harness({
  instance,
  mounted = true,
  phaseId = PHASE,
}: {
  instance: number;
  mounted?: boolean;
  phaseId?: string;
}) {
  const { registerBarEl, arm } = useArmedBarFocus();
  armFromHarness = arm;
  // A second element that is never the armed bar — proves focus is targeted,
  // and gives the test somewhere else to put focus.
  return (
    <>
      <button type="button" data-testid="elsewhere">
        elsewhere
      </button>
      {mounted && (
        <div
          key={instance}
          role="slider"
          tabIndex={0}
          data-testid={`bar-${instance}`}
          ref={(el) => registerBarEl(phaseId, el)}
        />
      )}
    </>
  );
}

describe('useArmedBarFocus', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('focuses the mounted bar as soon as the edit is armed', () => {
    render(<Harness instance={0} />);
    expect(screen.getByTestId('bar-0')).not.toHaveFocus();

    act(() => armFromHarness(PHASE));

    expect(screen.getByTestId('bar-0')).toHaveFocus();
  });

  it('SURVIVES the pin remount: the NEW instance takes focus, not the discarded one', () => {
    const view = render(<Harness instance={0} />);
    act(() => armFromHarness(PHASE));
    const first = screen.getByTestId('bar-0');
    expect(first).toHaveFocus();

    // the smooth scroll un-pins the Rule: the ternary swaps and every bar
    // remounts while the armed intent is still live.
    act(() => {
      view.rerender(<Harness instance={1} />);
    });

    const second = screen.getByTestId('bar-1');
    expect(second).not.toBe(first);
    expect(second).toHaveFocus();
  });

  it('follows more than one flip — focus lands wherever the dust settles', () => {
    const view = render(<Harness instance={0} />);
    act(() => armFromHarness(PHASE));
    act(() => view.rerender(<Harness instance={1} />));
    act(() => view.rerender(<Harness instance={2} />));

    expect(screen.getByTestId('bar-2')).toHaveFocus();
  });

  it('arms before the bar exists: focus waits for the first instance to appear', () => {
    const view = render(<Harness instance={0} mounted={false} />);
    act(() => armFromHarness(PHASE));
    expect(screen.queryByTestId('bar-0')).not.toBeInTheDocument();

    act(() => view.rerender(<Harness instance={0} mounted />));

    expect(screen.getByTestId('bar-0')).toHaveFocus();
  });

  it('an EXPIRED intent focuses nothing — a bar arriving late is left alone', () => {
    const view = render(<Harness instance={0} mounted={false} />);
    act(() => armFromHarness(PHASE));

    act(() => {
      jest.advanceTimersByTime(ARMED_FOCUS_EXPIRY_MS + 1);
    });
    act(() => view.rerender(<Harness instance={0} mounted />));

    expect(screen.getByTestId('bar-0')).not.toHaveFocus();
  });

  it('an expired intent does not ambush a later remount either', () => {
    const view = render(<Harness instance={0} />);
    act(() => armFromHarness(PHASE));
    expect(screen.getByTestId('bar-0')).toHaveFocus();

    screen.getByTestId('elsewhere').focus();
    act(() => {
      jest.advanceTimersByTime(ARMED_FOCUS_EXPIRY_MS + 1);
    });
    act(() => view.rerender(<Harness instance={1} />));

    expect(screen.getByTestId('bar-1')).not.toHaveFocus();
    expect(screen.getByTestId('elsewhere')).toHaveFocus();
  });

  it('never re-steals focus from a designer who clicked away mid-scroll', () => {
    const view = render(<Harness instance={0} />);
    act(() => armFromHarness(PHASE));
    expect(screen.getByTestId('bar-0')).toHaveFocus();

    // still inside the window, but the SAME element — it is focused once only.
    screen.getByTestId('elsewhere').focus();
    act(() => view.rerender(<Harness instance={0} />));

    expect(screen.getByTestId('elsewhere')).toHaveFocus();
  });

  it('a phase the Rule cannot draw never takes focus from anything else', () => {
    const view = render(<Harness instance={0} phaseId="drawn-phase" />);
    screen.getByTestId('elsewhere').focus();

    act(() => armFromHarness('unplaced-phase'));
    act(() => view.rerender(<Harness instance={1} phaseId="drawn-phase" />));

    expect(screen.getByTestId('bar-1')).not.toHaveFocus();
    expect(screen.getByTestId('elsewhere')).toHaveFocus();
  });
});
