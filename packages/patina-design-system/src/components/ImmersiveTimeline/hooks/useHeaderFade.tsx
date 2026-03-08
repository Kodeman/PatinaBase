'use client';

import { useEffect, useState } from 'react';
import type { ScrollAnimationConfig } from '../types/ScrollAnimationConfig';

export interface UseHeaderFadeReturn {
  opacity: number;
  isDarkMode: boolean;
  transition: string;
}

export function useHeaderFade(
  config?: ScrollAnimationConfig['header']
): UseHeaderFadeReturn {
  const [scrollY, setScrollY] = useState(0);

  // Default configuration
  const fadeOut = config?.fadeOut ?? false;
  const fadeRange = config?.fadeRange ?? [0, 200];
  const darkMode = config?.darkMode ?? false;
  const darkModeThreshold = config?.darkModeThreshold ?? 100;
  const finalOpacity = config?.opacity ?? 0;
  const easing = config?.easing ?? 'ease-out';

  useEffect(() => {
    if (!fadeOut) return;

    const handleScroll = () => {
      setScrollY(window.scrollY);
    };

    // Set initial value
    handleScroll();

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [fadeOut]);

  // Calculate opacity based on scroll position
  let opacity = 1;
  if (fadeOut) {
    const [startPx, endPx] = fadeRange;
    const progress = Math.min(Math.max((scrollY - startPx) / (endPx - startPx), 0), 1);
    opacity = 1 - progress * (1 - finalOpacity);
  }

  // Determine if dark mode should be active
  const isDarkMode = darkMode && scrollY > darkModeThreshold;

  // Build transition string
  const transition = `opacity 300ms ${easing}`;

  return {
    opacity,
    isDarkMode,
    transition,
  };
}