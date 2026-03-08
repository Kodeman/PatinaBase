import { useEffect, useRef } from 'react';

export function useThrottledScroll(callback: () => void) {
  const rafId = useRef<number | null>(null);
  const isScheduled = useRef(false);

  useEffect(() => {
    const handleScroll = () => {
      if (!isScheduled.current) {
        isScheduled.current = true;
        rafId.current = requestAnimationFrame(() => {
          callback();
          isScheduled.current = false;
        });
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
      }
    };
  }, [callback]);
}