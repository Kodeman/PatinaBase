import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useHeaderFade } from './useHeaderFade';
import type { ScrollAnimationConfig } from '../types/ScrollAnimationConfig';

describe('useHeaderFade', () => {
  it('should return default styles when fadeOut is false', () => {
    const config: ScrollAnimationConfig = {
      header: {
        fadeOut: false,
      },
    };

    const { result } = renderHook(() => useHeaderFade(config.header));

    expect(result.current.opacity).toBe(1);
    expect(result.current.isDarkMode).toBe(false);
  });

  it('should calculate opacity based on scroll position', () => {
    const config: ScrollAnimationConfig = {
      header: {
        fadeOut: true,
        fadeRange: [0, 200],
      },
    };

    // Mock window.scrollY
    Object.defineProperty(window, 'scrollY', {
      writable: true,
      value: 100,
    });

    const { result, rerender } = renderHook(() => useHeaderFade(config.header));

    // Trigger scroll event
    window.scrollY = 100;
    window.dispatchEvent(new Event('scroll'));
    rerender();

    // At 100px scroll with fadeRange [0, 200], opacity should be 0.5
    expect(result.current.opacity).toBe(0.5);
  });

  it('should enable dark mode when scrolled past threshold', () => {
    const config: ScrollAnimationConfig = {
      header: {
        fadeOut: true,
        darkMode: true,
        darkModeThreshold: 100,
      },
    };

    Object.defineProperty(window, 'scrollY', {
      writable: true,
      value: 150,
    });

    const { result, rerender } = renderHook(() => useHeaderFade(config.header));

    window.scrollY = 150;
    window.dispatchEvent(new Event('scroll'));
    rerender();

    expect(result.current.isDarkMode).toBe(true);
  });

  it('should clean up scroll listener on unmount', () => {
    const config: ScrollAnimationConfig = {
      header: {
        fadeOut: true,
      },
    };

    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useHeaderFade(config.header));

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('scroll', expect.any(Function));
  });

  it('should apply custom easing function', () => {
    const config: ScrollAnimationConfig = {
      header: {
        fadeOut: true,
        fadeRange: [0, 200],
        easing: 'ease-in-out',
      },
    };

    const { result } = renderHook(() => useHeaderFade(config.header));

    expect(result.current.transition).toContain('ease-in-out');
  });

  it('should respect final opacity setting', () => {
    const config: ScrollAnimationConfig = {
      header: {
        fadeOut: true,
        fadeRange: [0, 100],
        opacity: 0.2,
      },
    };

    Object.defineProperty(window, 'scrollY', {
      writable: true,
      value: 100,
    });

    const { result, rerender } = renderHook(() => useHeaderFade(config.header));

    window.scrollY = 100;
    window.dispatchEvent(new Event('scroll'));
    rerender();

    // At max scroll position, should reach final opacity
    expect(result.current.opacity).toBeCloseTo(0.2, 5);
  });
});