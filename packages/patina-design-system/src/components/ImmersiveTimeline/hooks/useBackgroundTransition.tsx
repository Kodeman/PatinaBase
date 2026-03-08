'use client';

import { useEffect, useState } from 'react';
import type { ScrollAnimationConfig } from '../types/ScrollAnimationConfig';

export interface UseBackgroundTransitionReturn {
  overlayOpacity: number;
  gradient: string;
  transition: string;
}

export function useBackgroundTransition(
  config?: ScrollAnimationConfig['background']
): UseBackgroundTransitionReturn {
  const [scrollY, setScrollY] = useState(0);

  // Default configuration
  const darkOverlay = config?.darkOverlay ?? false;
  const maxOpacity = config?.maxOpacity ?? 0.7;
  const gradient = config?.gradient ?? 'linear-gradient(to bottom, rgba(0,0,0,0.8), rgba(0,0,0,0.4))';
  const transitionDuration = config?.transitionDuration ?? 300;

  useEffect(() => {
    if (!darkOverlay) return;

    const handleScroll = () => {
      setScrollY(window.scrollY);
    };

    // Set initial value
    handleScroll();

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [darkOverlay]);

  // Calculate overlay opacity based on scroll position
  let overlayOpacity = 0;
  if (darkOverlay) {
    // Opacity reaches max at 500px scroll
    const scrollRange = 500;
    const progress = Math.min(scrollY / scrollRange, 1);
    overlayOpacity = progress * maxOpacity;
  }

  // Return gradient or none based on darkOverlay setting
  const finalGradient = darkOverlay ? gradient : 'none';

  // Build transition string
  const transition = `opacity ${transitionDuration}ms ease-out`;

  return {
    overlayOpacity,
    gradient: finalGradient,
    transition,
  };
}