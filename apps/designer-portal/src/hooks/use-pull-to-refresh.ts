'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void> | void;
  threshold?: number;
  resistance?: number;
  enabled?: boolean;
}

/**
 * Hook for implementing pull-to-refresh on mobile devices
 */
export function usePullToRefresh({
  onRefresh,
  threshold = 80,
  resistance = 2.5,
  enabled = true,
}: UsePullToRefreshOptions) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const touchStartRef = useRef<{ y: number; scrollTop: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!enabled || isRefreshing) return;

    const container = containerRef.current;
    if (!container) return;

    const scrollTop = container.scrollTop || window.scrollY;

    // Only start pull if at the top of the page
    if (scrollTop > 0) return;

    const touch = e.touches[0];
    touchStartRef.current = {
      y: touch.clientY,
      scrollTop,
    };
  }, [enabled, isRefreshing]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!enabled || isRefreshing || !touchStartRef.current) return;

    const container = containerRef.current;
    if (!container) return;

    const scrollTop = container.scrollTop || window.scrollY;
    if (scrollTop > 0) {
      touchStartRef.current = null;
      setPullDistance(0);
      return;
    }

    const touch = e.touches[0];
    const distance = touch.clientY - touchStartRef.current.y;

    if (distance > 0) {
      // Apply resistance to make pulling feel natural
      const resistedDistance = Math.min(distance / resistance, threshold * 1.5);
      setPullDistance(resistedDistance);

      // Prevent default scrolling when pulling
      if (resistedDistance > 5) {
        e.preventDefault();
      }
    }
  }, [enabled, isRefreshing, threshold, resistance]);

  const handleTouchEnd = useCallback(async () => {
    if (!enabled || isRefreshing) return;

    if (pullDistance >= threshold) {
      setIsRefreshing(true);
      setPullDistance(0);

      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
      }
    } else {
      setPullDistance(0);
    }

    touchStartRef.current = null;
  }, [enabled, isRefreshing, pullDistance, threshold, onRefresh]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [enabled, handleTouchStart, handleTouchMove, handleTouchEnd]);

  return {
    containerRef,
    isRefreshing,
    pullDistance,
  };
}
