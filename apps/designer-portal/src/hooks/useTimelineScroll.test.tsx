import { renderHook, act } from '@testing-library/react';
import { useTimelineScroll } from './useTimelineScroll';

describe('useTimelineScroll', () => {
  beforeEach(() => {
    // Reset scroll position before each test
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true, configurable: true });
    // Mock requestAnimationFrame
    global.requestAnimationFrame = jest.fn((cb) => {
      cb();
      return 1;
    });
    global.cancelAnimationFrame = jest.fn();
  });

  it('should track header opacity based on scroll position', () => {
    const { result } = renderHook(() => useTimelineScroll());

    expect(result.current.headerOpacity).toBe(1);

    act(() => {
      // Simulate scroll to 100px
      Object.defineProperty(window, 'scrollY', { value: 100, writable: true });
      window.dispatchEvent(new Event('scroll'));
    });

    expect(result.current.headerOpacity).toBe(0.5);

    act(() => {
      // Simulate scroll to 200px
      window.scrollY = 200;
      window.dispatchEvent(new Event('scroll'));
    });

    expect(result.current.headerOpacity).toBe(0);
  });

  it('should toggle dark background after scroll threshold', () => {
    const { result } = renderHook(() => useTimelineScroll());

    expect(result.current.isDarkBackground).toBe(false);

    act(() => {
      window.scrollY = 150;
      window.dispatchEvent(new Event('scroll'));
    });

    expect(result.current.isDarkBackground).toBe(true);
  });
});