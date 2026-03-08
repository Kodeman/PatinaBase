import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useBackgroundTransition } from './useBackgroundTransition';
import type { ScrollAnimationConfig } from '../types/ScrollAnimationConfig';

describe('useBackgroundTransition', () => {
  it('should return default styles when darkOverlay is false', () => {
    const config: ScrollAnimationConfig = {
      background: {
        darkOverlay: false,
      },
    };

    const { result } = renderHook(() => useBackgroundTransition(config.background));

    expect(result.current.overlayOpacity).toBe(0);
    expect(result.current.gradient).toBe('none');
  });

  it('should calculate overlay opacity based on scroll position', () => {
    const config: ScrollAnimationConfig = {
      background: {
        darkOverlay: true,
        maxOpacity: 0.7,
      },
    };

    // Mock window.scrollY
    Object.defineProperty(window, 'scrollY', {
      writable: true,
      value: 300,
    });

    const { result, rerender } = renderHook(() => useBackgroundTransition(config.background));

    // Trigger scroll event
    window.scrollY = 300;
    window.dispatchEvent(new Event('scroll'));
    rerender();

    // Opacity should increase with scroll, capped at maxOpacity
    expect(result.current.overlayOpacity).toBeGreaterThan(0);
    expect(result.current.overlayOpacity).toBeLessThanOrEqual(0.7);
  });

  it('should apply custom gradient when specified', () => {
    const customGradient = 'linear-gradient(to bottom, rgba(0,0,0,0.9), rgba(0,0,0,0.3))';
    const config: ScrollAnimationConfig = {
      background: {
        darkOverlay: true,
        gradient: customGradient,
      },
    };

    const { result } = renderHook(() => useBackgroundTransition(config.background));

    expect(result.current.gradient).toBe(customGradient);
  });

  it('should respect transition duration', () => {
    const config: ScrollAnimationConfig = {
      background: {
        darkOverlay: true,
        transitionDuration: 500,
      },
    };

    const { result } = renderHook(() => useBackgroundTransition(config.background));

    expect(result.current.transition).toContain('500ms');
  });

  it('should clean up scroll listener on unmount', () => {
    const config: ScrollAnimationConfig = {
      background: {
        darkOverlay: true,
      },
    };

    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useBackgroundTransition(config.background));

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('scroll', expect.any(Function));
  });

  it('should reach max opacity when scrolled far enough', () => {
    const config: ScrollAnimationConfig = {
      background: {
        darkOverlay: true,
        maxOpacity: 0.8,
      },
    };

    Object.defineProperty(window, 'scrollY', {
      writable: true,
      value: 800, // Far enough to reach max
    });

    const { result, rerender } = renderHook(() => useBackgroundTransition(config.background));

    window.scrollY = 800;
    window.dispatchEvent(new Event('scroll'));
    rerender();

    expect(result.current.overlayOpacity).toBeCloseTo(0.8, 5);
  });

  it('should have zero opacity at top of page', () => {
    const config: ScrollAnimationConfig = {
      background: {
        darkOverlay: true,
        maxOpacity: 0.7,
      },
    };

    Object.defineProperty(window, 'scrollY', {
      writable: true,
      value: 0,
    });

    const { result, rerender } = renderHook(() => useBackgroundTransition(config.background));

    window.scrollY = 0;
    window.dispatchEvent(new Event('scroll'));
    rerender();

    expect(result.current.overlayOpacity).toBe(0);
  });
});