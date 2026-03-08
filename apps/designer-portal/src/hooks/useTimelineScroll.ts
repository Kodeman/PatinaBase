import { useState, useCallback } from 'react';
import { useThrottledScroll } from './useThrottledScroll';

export function useTimelineScroll() {
  const [scrollY, setScrollY] = useState(0);

  const handleScroll = useCallback(() => {
    setScrollY(window.scrollY);
  }, []);

  useThrottledScroll(handleScroll);

  // Calculate header opacity: 1 at top, 0 at 200px
  const headerOpacity = Math.max(0, Math.min(1, 1 - scrollY / 200));

  // Dark background activates after 100px
  const isDarkBackground = scrollY > 100;

  return {
    scrollY,
    headerOpacity,
    isDarkBackground,
  };
}