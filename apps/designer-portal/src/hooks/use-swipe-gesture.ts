'use client';

import { useEffect, useRef, useCallback } from 'react';

export interface SwipeGestureHandlers {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
}

export interface UseSwipeGestureOptions extends SwipeGestureHandlers {
  threshold?: number; // Minimum distance for swipe
  restraint?: number; // Maximum distance perpendicular to swipe direction
  allowedTime?: number; // Maximum time for swipe
  enabled?: boolean;
}

/**
 * Hook for detecting swipe gestures on touch devices
 */
export function useSwipeGesture({
  onSwipeLeft,
  onSwipeRight,
  onSwipeUp,
  onSwipeDown,
  threshold = 50,
  restraint = 100,
  allowedTime = 300,
  enabled = true,
}: UseSwipeGestureOptions = {}) {
  const ref = useRef<HTMLElement>(null);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!enabled) return;

    const touch = e.touches[0];
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
    };
  }, [enabled]);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (!enabled || !touchStartRef.current) return;

    const touch = e.changedTouches[0];
    const startTouch = touchStartRef.current;

    const distX = touch.clientX - startTouch.x;
    const distY = touch.clientY - startTouch.y;
    const elapsedTime = Date.now() - startTouch.time;

    // Check if swipe was fast enough
    if (elapsedTime > allowedTime) {
      touchStartRef.current = null;
      return;
    }

    // Horizontal swipe
    if (Math.abs(distX) >= threshold && Math.abs(distY) <= restraint) {
      if (distX < 0) {
        onSwipeLeft?.();
      } else {
        onSwipeRight?.();
      }
    }
    // Vertical swipe
    else if (Math.abs(distY) >= threshold && Math.abs(distX) <= restraint) {
      if (distY < 0) {
        onSwipeUp?.();
      } else {
        onSwipeDown?.();
      }
    }

    touchStartRef.current = null;
  }, [enabled, threshold, restraint, allowedTime, onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown]);

  useEffect(() => {
    const element = ref.current;
    if (!element || !enabled) return;

    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, [enabled, handleTouchStart, handleTouchEnd]);

  return ref;
}
