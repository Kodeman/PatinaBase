import { act, renderHook } from '@testing-library/react';

import { HOLD_CEILING_MS, useHoldCeiling } from '../use-hold-ceiling';

/* ── A ceiling on the hold ──────────────────────────────────────────────────
   Silence is the rule while an answer is on its way. A fetch that never
   resolves is not silence — it is a blank page with nothing said. ────────── */

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useHoldCeiling', () => {
  it('says nothing while the hold is still young', () => {
    const { result } = renderHook(() => useHoldCeiling(true));

    expect(result.current).toBe(false);

    act(() => {
      jest.advanceTimersByTime(HOLD_CEILING_MS - 1);
    });
    expect(result.current).toBe(false);
  });

  it('reports a hold that has outlasted its ceiling', () => {
    const { result } = renderHook(() => useHoldCeiling(true));

    act(() => {
      jest.advanceTimersByTime(HOLD_CEILING_MS);
    });
    expect(result.current).toBe(true);
  });

  it('never reports a page that is not holding at all', () => {
    const { result } = renderHook(() => useHoldCeiling(false));

    act(() => {
      jest.advanceTimersByTime(HOLD_CEILING_MS * 3);
    });
    expect(result.current).toBe(false);
  });

  it('takes the sentence back the moment the hold ends', () => {
    const { result, rerender } = renderHook(
      ({ holding }: { holding: boolean }) => useHoldCeiling(holding),
      { initialProps: { holding: true } },
    );

    act(() => {
      jest.advanceTimersByTime(HOLD_CEILING_MS);
    });
    expect(result.current).toBe(true);

    rerender({ holding: false });
    expect(result.current).toBe(false);
  });
});
