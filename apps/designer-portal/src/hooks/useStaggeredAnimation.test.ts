import { renderHook } from '@testing-library/react';
import { useStaggeredAnimation } from './useStaggeredAnimation';

describe('useStaggeredAnimation', () => {
  it('should return staggered delays for each index', () => {
    const { result } = renderHook(() =>
      useStaggeredAnimation({ itemCount: 3, staggerMs: 100 })
    );

    expect(result.current.getDelay(0)).toBe(0);
    expect(result.current.getDelay(1)).toBe(100);
    expect(result.current.getDelay(2)).toBe(200);
  });

  it('should cap maximum delay', () => {
    const { result } = renderHook(() =>
      useStaggeredAnimation({
        itemCount: 10,
        staggerMs: 100,
        maxDelayMs: 300
      })
    );

    expect(result.current.getDelay(0)).toBe(0);
    expect(result.current.getDelay(3)).toBe(300);
    expect(result.current.getDelay(5)).toBe(300);
  });

  it('should return CSS variable for delay', () => {
    const { result } = renderHook(() =>
      useStaggeredAnimation({ itemCount: 3, staggerMs: 100 })
    );

    expect(result.current.getDelayVar(1)).toBe('100ms');
  });
});