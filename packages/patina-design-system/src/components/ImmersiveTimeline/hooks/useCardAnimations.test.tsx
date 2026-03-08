import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCardAnimations } from './useCardAnimations';
import type { ScrollAnimationConfig } from '../types/ScrollAnimationConfig';

describe('useCardAnimations', () => {
  let observeMock: vi.Mock;
  let unobserveMock: vi.Mock;
  let intersectionObserverMock: any;

  beforeEach(() => {
    observeMock = vi.fn();
    unobserveMock = vi.fn();

    intersectionObserverMock = vi.fn((callback) => ({
      observe: observeMock,
      unobserve: unobserveMock,
      disconnect: vi.fn(),
      root: null,
      rootMargin: '',
      thresholds: [],
      takeRecords: () => [],
      // Store the callback for testing
      __callback: callback,
    }));

    global.IntersectionObserver = intersectionObserverMock;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return default animation class when no config provided', () => {
    const { result } = renderHook(() => useCardAnimations());

    const animationClass = result.current.getAnimationClass('test-id');
    expect(animationClass).toBe('');
  });

  it('should observe element when ref is set', () => {
    const config: ScrollAnimationConfig = {
      cards: {
        entrance: 'fade',
      },
    };

    const { result } = renderHook(() => useCardAnimations(config.cards));

    const element = document.createElement('div');
    act(() => {
      result.current.observeElement('card-1', element);
    });

    expect(observeMock).toHaveBeenCalledWith(element);
  });

  it('should handle fade animation when element is visible', () => {
    const config: ScrollAnimationConfig = {
      cards: {
        entrance: 'fade',
        fadeFrom: 0,
        duration: 300,
        easing: 'ease-out',
      },
    };

    const { result } = renderHook(() => useCardAnimations(config.cards));

    const element = document.createElement('div');
    element.setAttribute('data-card-id', 'card-1');

    act(() => {
      result.current.observeElement('card-1', element);
    });

    // Get the observer instance and its callback
    const observerInstance = intersectionObserverMock.mock.results[0].value;
    const callback = observerInstance.__callback;

    // Simulate intersection
    act(() => {
      callback([
        {
          target: element,
          isIntersecting: true,
          intersectionRatio: 0.5,
        },
      ]);
    });

    const animationClass = result.current.getAnimationClass('card-1');
    expect(animationClass).toContain('opacity-100');
  });

  it('should handle fade-scale animation', () => {
    const config: ScrollAnimationConfig = {
      cards: {
        entrance: 'fade-scale',
        fadeFrom: 0,
        scaleFrom: 0.95,
        duration: 400,
      },
    };

    const { result } = renderHook(() => useCardAnimations(config.cards));

    const element = document.createElement('div');
    element.setAttribute('data-card-id', 'card-1');

    act(() => {
      result.current.observeElement('card-1', element);
    });

    const observerInstance = intersectionObserverMock.mock.results[0].value;
    const callback = observerInstance.__callback;

    act(() => {
      callback([
        {
          target: element,
          isIntersecting: true,
          intersectionRatio: 0.5,
        },
      ]);
    });

    const animationClass = result.current.getAnimationClass('card-1');
    expect(animationClass).toContain('opacity-100');
    expect(animationClass).toContain('scale-100');
  });

  it('should handle fade-scale-slide animation', () => {
    const config: ScrollAnimationConfig = {
      cards: {
        entrance: 'fade-scale-slide',
        fadeFrom: 0,
        scaleFrom: 0.9,
        slideDistance: 30,
        duration: 500,
      },
    };

    const { result } = renderHook(() => useCardAnimations(config.cards));

    const element = document.createElement('div');
    element.setAttribute('data-card-id', 'card-1');

    act(() => {
      result.current.observeElement('card-1', element);
    });

    const observerInstance = intersectionObserverMock.mock.results[0].value;
    const callback = observerInstance.__callback;

    act(() => {
      callback([
        {
          target: element,
          isIntersecting: true,
          intersectionRatio: 0.5,
        },
      ]);
    });

    const animationClass = result.current.getAnimationClass('card-1');
    expect(animationClass).toContain('opacity-100');
    expect(animationClass).toContain('scale-100');
    expect(animationClass).toContain('translate-y-0');
  });

  it('should respect stagger delay for multiple cards', () => {
    const config: ScrollAnimationConfig = {
      cards: {
        entrance: 'fade',
        stagger: 100,
      },
    };

    const { result } = renderHook(() => useCardAnimations(config.cards));

    // Observe multiple elements
    const element1 = document.createElement('div');
    const element2 = document.createElement('div');

    act(() => {
      result.current.observeElement('card-1', element1);
      result.current.observeElement('card-2', element2);
    });

    const delay1 = result.current.getStaggerDelay('card-1');
    const delay2 = result.current.getStaggerDelay('card-2');

    expect(delay2).toBe(delay1 + 100);
  });

  it('should unobserve element when visibility changes', () => {
    const config: ScrollAnimationConfig = {
      cards: {
        entrance: 'fade',
      },
    };

    const { result, unmount } = renderHook(() => useCardAnimations(config.cards));

    const element = document.createElement('div');
    element.setAttribute('data-card-id', 'card-1');

    act(() => {
      result.current.observeElement('card-1', element);
    });

    unmount();

    // Check that cleanup happened
    expect(unobserveMock).toHaveBeenCalled();
  });

  it('should use custom threshold value', () => {
    const config: ScrollAnimationConfig = {
      cards: {
        entrance: 'fade',
        threshold: 0.5,
      },
    };

    const { result } = renderHook(() => useCardAnimations(config.cards));

    const element = document.createElement('div');
    act(() => {
      result.current.observeElement('card-1', element);
    });

    expect(intersectionObserverMock).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        threshold: 0.5,
      })
    );
  });
});