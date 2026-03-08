import { renderHook } from '@testing-library/react';
import { useThrottledScroll } from './useThrottledScroll';

describe('useThrottledScroll', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should throttle scroll events using RAF', () => {
    const callback = jest.fn();
    renderHook(() => useThrottledScroll(callback));

    // Simulate multiple scroll events
    for (let i = 0; i < 10; i++) {
      window.dispatchEvent(new Event('scroll'));
    }

    // Callback should not be called immediately
    expect(callback).not.toHaveBeenCalled();

    // Advance one animation frame
    jest.runOnlyPendingTimers();

    // Callback should be called only once
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('should cleanup on unmount', () => {
    const callback = jest.fn();
    const { unmount } = renderHook(() => useThrottledScroll(callback));

    unmount();

    window.dispatchEvent(new Event('scroll'));
    jest.runOnlyPendingTimers();

    expect(callback).not.toHaveBeenCalled();
  });
});