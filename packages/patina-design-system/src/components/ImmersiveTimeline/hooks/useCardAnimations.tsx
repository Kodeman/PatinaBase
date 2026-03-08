'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { ScrollAnimationConfig } from '../types/ScrollAnimationConfig';

export interface UseCardAnimationsReturn {
  observeElement: (id: string, element: HTMLElement | null) => void;
  getAnimationStyle: (id: string) => React.CSSProperties;
  getAnimationClass: (id: string) => string;
  getStaggerDelay: (id: string) => number;
}

export function useCardAnimations(
  config?: ScrollAnimationConfig['cards']
): UseCardAnimationsReturn {
  const [visibleCards, setVisibleCards] = useState<Set<string>>(new Set());
  const [, setReflowTrigger] = useState(false); // Force reflow between class changes
  const observersRef = useRef<Map<string, IntersectionObserver>>(new Map());
  const elementsRef = useRef<Map<string, HTMLElement>>(new Map());
  const orderRef = useRef<string[]>([]);
  const reflowTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Default configuration
  const entrance = config?.entrance ?? 'fade';
  const fadeFrom = config?.fadeFrom ?? 0;
  const scaleFrom = config?.scaleFrom ?? 0.95;
  const slideDistance = config?.slideDistance ?? 20;
  const duration = config?.duration ?? 300;
  const easing = config?.easing ?? 'ease-out';
  const threshold = config?.threshold ?? 0.25;
  const stagger = config?.stagger ?? 0;

  const observeElement = useCallback(
    (id: string, element: HTMLElement | null) => {
      // Clean up existing observer
      const existingObserver = observersRef.current.get(id);
      const existingElement = elementsRef.current.get(id);

      if (existingObserver && existingElement) {
        existingObserver.unobserve(existingElement);
        existingObserver.disconnect();
        observersRef.current.delete(id);
        elementsRef.current.delete(id);
      }

      if (!element || !config) return;

      // Store element reference
      elementsRef.current.set(id, element);

      // Track order for stagger
      if (!orderRef.current.includes(id)) {
        orderRef.current.push(id);
      }

      // Create intersection observer
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              // Clear any pending reflow timeout for this element
              const existingTimeout = reflowTimeoutsRef.current.get(id);
              if (existingTimeout) {
                clearTimeout(existingTimeout);
              }

              // Use double requestAnimationFrame to force browser reflow
              // First rAF: React renders with initial hidden state (opacity-0, scale-95, etc.)
              // Second rAF: We trigger state change to visible state (opacity-100, scale-100, etc.)
              // Browser paints between these, creating two distinct frames for transition
              const reflowTimeout = setTimeout(() => {
                requestAnimationFrame(() => {
                  requestAnimationFrame(() => {
                    setVisibleCards((prev) => new Set(prev).add(id));
                    // Unobserve after triggering animation to prevent re-triggers
                    observer.unobserve(element);
                  });
                });
              }, 0);

              reflowTimeoutsRef.current.set(id, reflowTimeout);
            }
          });
        },
        {
          threshold,
          rootMargin: '-50px 0px -50px 0px' // Start animation when element is 50px into viewport
        }
      );

      observer.observe(element);
      observersRef.current.set(id, observer);
    },
    [config, threshold]
  );

  const getAnimationStyle = useCallback(
    (id: string): React.CSSProperties => {
      // If no config provided, return empty object
      if (!config) return {};

      const isVisible = visibleCards.has(id);
      const staggerDelay = orderRef.current.indexOf(id) * stagger;

      const baseStyle: React.CSSProperties = {
        transition: `all ${duration}ms ${easing} ${staggerDelay}ms`,
      };

      if (!isVisible) {
        // Initial hidden state
        switch (entrance) {
          case 'fade':
            return {
              ...baseStyle,
              opacity: fadeFrom,
            };
          case 'fade-scale':
            return {
              ...baseStyle,
              opacity: fadeFrom,
              transform: `scale(${scaleFrom})`,
            };
          case 'fade-scale-slide':
            return {
              ...baseStyle,
              opacity: fadeFrom,
              transform: `scale(${scaleFrom}) translateY(${slideDistance}px)`,
            };
          default:
            return baseStyle;
        }
      } else {
        // Visible state
        switch (entrance) {
          case 'fade':
          case 'fade-scale':
          case 'fade-scale-slide':
            return {
              ...baseStyle,
              opacity: 1,
              transform: 'scale(1) translateY(0)',
            };
          default:
            return baseStyle;
        }
      }
    },
    [config, entrance, fadeFrom, scaleFrom, slideDistance, duration, easing, stagger, visibleCards]
  );

  // Keep the old method for backward compatibility but using fixed classes
  const getAnimationClass = useCallback(
    (id: string): string => {
      // If no config provided, return empty string
      if (!config) return '';

      const isVisible = visibleCards.has(id);

      // Use pre-defined Tailwind classes that exist in the CSS
      if (!isVisible) {
        // Initial hidden state - use actual Tailwind utility classes
        switch (entrance) {
          case 'fade':
            return 'opacity-0 transition-all duration-300 ease-out';
          case 'fade-scale':
            return 'opacity-0 scale-95 transition-all duration-300 ease-out';
          case 'fade-scale-slide':
            return 'opacity-0 scale-95 translate-y-5 transition-all duration-300 ease-out';
          default:
            return '';
        }
      } else {
        // Visible state
        switch (entrance) {
          case 'fade':
            return 'opacity-100 transition-all duration-300 ease-out';
          case 'fade-scale':
            return 'opacity-100 scale-100 transition-all duration-300 ease-out';
          case 'fade-scale-slide':
            return 'opacity-100 scale-100 translate-y-0 transition-all duration-300 ease-out';
          default:
            return '';
        }
      }
    },
    [config, entrance, visibleCards]
  );

  const getStaggerDelay = useCallback(
    (id: string): number => {
      const index = orderRef.current.indexOf(id);
      return index >= 0 ? index * stagger : 0;
    },
    [stagger]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clear pending reflow timeouts
      reflowTimeoutsRef.current.forEach((timeout) => {
        clearTimeout(timeout);
      });
      reflowTimeoutsRef.current.clear();

      // Disconnect all observers
      observersRef.current.forEach((observer, id) => {
        const element = elementsRef.current.get(id);
        if (element) {
          observer.unobserve(element);
        }
        observer.disconnect();
      });
      observersRef.current.clear();
      elementsRef.current.clear();
    };
  }, []);

  return {
    observeElement,
    getAnimationStyle,
    getAnimationClass,
    getStaggerDelay,
  };
}