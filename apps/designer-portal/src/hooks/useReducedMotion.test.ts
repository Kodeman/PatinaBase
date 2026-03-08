import { renderHook } from '@testing-library/react';
import { useReducedMotion } from './useReducedMotion';

describe('useReducedMotion', () => {
  it('should return false when prefers-reduced-motion is not set', () => {
    window.matchMedia = jest.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    }));

    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });

  it('should return true when prefers-reduced-motion is reduce', () => {
    window.matchMedia = jest.fn().mockImplementation(query => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    }));

    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
  });

  it('should update when preference changes', () => {
    let listener: ((e: MediaQueryListEvent) => void) | null = null;

    window.matchMedia = jest.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      addEventListener: (event: string, cb: (e: MediaQueryListEvent) => void) => {
        listener = cb;
      },
      removeEventListener: jest.fn(),
    }));

    const { result, rerender } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);

    // Simulate preference change
    if (listener) {
      listener({ matches: true } as MediaQueryListEvent);
    }
    rerender();

    expect(result.current).toBe(true);
  });
});