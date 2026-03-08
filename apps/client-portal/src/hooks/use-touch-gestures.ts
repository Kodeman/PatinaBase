'use client';

/**
 * Touch Gestures Hook
 * Provides mobile-optimized touch interactions for timeline navigation
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface TouchState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  deltaX: number;
  deltaY: number;
  velocity: number;
  direction: 'left' | 'right' | 'up' | 'down' | null;
  isActive: boolean;
}

interface UseTouchGesturesOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  onPinch?: (scale: number) => void;
  onDoubleTap?: (x: number, y: number) => void;
  onLongPress?: (x: number, y: number) => void;
  swipeThreshold?: number; // Minimum distance for swipe (default: 50)
  velocityThreshold?: number; // Minimum velocity for swipe (default: 0.3)
  longPressDelay?: number; // Delay for long press (default: 500ms)
  doubleTapDelay?: number; // Max delay between taps (default: 300ms)
  enabled?: boolean;
}

const defaultOptions: Required<Omit<UseTouchGesturesOptions, 'onSwipeLeft' | 'onSwipeRight' | 'onSwipeUp' | 'onSwipeDown' | 'onPinch' | 'onDoubleTap' | 'onLongPress'>> = {
  swipeThreshold: 50,
  velocityThreshold: 0.3,
  longPressDelay: 500,
  doubleTapDelay: 300,
  enabled: true,
};

export function useTouchGestures<T extends HTMLElement = HTMLElement>(
  options: UseTouchGesturesOptions = {}
) {
  const opts = { ...defaultOptions, ...options };
  const ref = useRef<T>(null);
  const [touchState, setTouchState] = useState<TouchState>({
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    deltaX: 0,
    deltaY: 0,
    velocity: 0,
    direction: null,
    isActive: false,
  });

  // Refs for tracking
  const startTimeRef = useRef<number>(0);
  const lastTapRef = useRef<number>(0);
  const longPressTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const initialTouchDistanceRef = useRef<number>(0);

  // Clear long press timeout
  const clearLongPressTimeout = useCallback(() => {
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
  }, []);

  // Calculate distance between two touch points (for pinch)
  const getTouchDistance = (touches: TouchList): number => {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Handle touch start
  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!opts.enabled) return;

    const touch = e.touches[0];
    const now = Date.now();

    // Check for double tap
    if (opts.onDoubleTap && now - lastTapRef.current < opts.doubleTapDelay) {
      opts.onDoubleTap(touch.clientX, touch.clientY);
      lastTapRef.current = 0;
      return;
    }
    lastTapRef.current = now;

    // Store initial touch
    startTimeRef.current = now;
    setTouchState({
      startX: touch.clientX,
      startY: touch.clientY,
      currentX: touch.clientX,
      currentY: touch.clientY,
      deltaX: 0,
      deltaY: 0,
      velocity: 0,
      direction: null,
      isActive: true,
    });

    // Handle pinch start
    if (e.touches.length === 2 && opts.onPinch) {
      initialTouchDistanceRef.current = getTouchDistance(e.touches);
    }

    // Start long press timer
    if (opts.onLongPress) {
      clearLongPressTimeout();
      longPressTimeoutRef.current = setTimeout(() => {
        opts.onLongPress?.(touch.clientX, touch.clientY);
      }, opts.longPressDelay);
    }
  }, [opts, clearLongPressTimeout]);

  // Handle touch move
  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!opts.enabled || !touchState.isActive) return;

    const touch = e.touches[0];
    const deltaX = touch.clientX - touchState.startX;
    const deltaY = touch.clientY - touchState.startY;
    const elapsed = Date.now() - startTimeRef.current;
    const velocity = Math.sqrt(deltaX * deltaX + deltaY * deltaY) / (elapsed || 1);

    // Determine direction
    let direction: TouchState['direction'] = null;
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      direction = deltaX > 0 ? 'right' : 'left';
    } else {
      direction = deltaY > 0 ? 'down' : 'up';
    }

    setTouchState(prev => ({
      ...prev,
      currentX: touch.clientX,
      currentY: touch.clientY,
      deltaX,
      deltaY,
      velocity,
      direction,
    }));

    // Handle pinch
    if (e.touches.length === 2 && opts.onPinch && initialTouchDistanceRef.current > 0) {
      const currentDistance = getTouchDistance(e.touches);
      const scale = currentDistance / initialTouchDistanceRef.current;
      opts.onPinch(scale);
    }

    // Cancel long press if moved too much
    if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
      clearLongPressTimeout();
    }
  }, [opts, touchState.isActive, touchState.startX, touchState.startY, clearLongPressTimeout]);

  // Handle touch end
  const handleTouchEnd = useCallback(() => {
    if (!opts.enabled || !touchState.isActive) return;

    clearLongPressTimeout();

    const { deltaX, deltaY, velocity, direction } = touchState;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    // Check if it's a valid swipe
    const isHorizontalSwipe = absX > opts.swipeThreshold && absX > absY;
    const isVerticalSwipe = absY > opts.swipeThreshold && absY > absX;
    const hasEnoughVelocity = velocity > opts.velocityThreshold;

    if (isHorizontalSwipe && hasEnoughVelocity) {
      if (direction === 'left' && opts.onSwipeLeft) {
        opts.onSwipeLeft();
      } else if (direction === 'right' && opts.onSwipeRight) {
        opts.onSwipeRight();
      }
    } else if (isVerticalSwipe && hasEnoughVelocity) {
      if (direction === 'up' && opts.onSwipeUp) {
        opts.onSwipeUp();
      } else if (direction === 'down' && opts.onSwipeDown) {
        opts.onSwipeDown();
      }
    }

    // Reset state
    setTouchState(prev => ({
      ...prev,
      isActive: false,
      velocity: 0,
    }));
    initialTouchDistanceRef.current = 0;
  }, [opts, touchState, clearLongPressTimeout]);

  // Attach event listeners
  useEffect(() => {
    const element = ref.current;
    if (!element || !opts.enabled) return;

    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchmove', handleTouchMove, { passive: true });
    element.addEventListener('touchend', handleTouchEnd);
    element.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
      element.removeEventListener('touchcancel', handleTouchEnd);
      clearLongPressTimeout();
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd, opts.enabled, clearLongPressTimeout]);

  return {
    ref,
    touchState,
    isGesturing: touchState.isActive,
  };
}

/**
 * Hook for pull-to-refresh functionality
 */
export interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void>;
  pullThreshold?: number; // Distance to trigger refresh (default: 80)
  maxPull?: number; // Maximum pull distance (default: 120)
  enabled?: boolean;
}

export function usePullToRefresh<T extends HTMLElement = HTMLElement>(
  options: UsePullToRefreshOptions
) {
  const { onRefresh, pullThreshold = 80, maxPull = 120, enabled = true } = options;

  const ref = useRef<T>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startYRef = useRef(0);
  const isPullingRef = useRef(false);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!enabled || isRefreshing) return;

    const element = ref.current;
    if (!element) return;

    // Only trigger if at top of scrollable area
    if (element.scrollTop <= 0) {
      startYRef.current = e.touches[0].clientY;
      isPullingRef.current = true;
    }
  }, [enabled, isRefreshing]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!enabled || !isPullingRef.current || isRefreshing) return;

    const currentY = e.touches[0].clientY;
    const delta = currentY - startYRef.current;

    if (delta > 0) {
      // Apply resistance for overscroll effect
      const resistance = Math.min(delta, maxPull) / maxPull;
      const distance = delta * (1 - resistance * 0.5);
      setPullDistance(Math.min(distance, maxPull));
    }
  }, [enabled, isRefreshing, maxPull]);

  const handleTouchEnd = useCallback(async () => {
    if (!enabled || !isPullingRef.current) return;

    isPullingRef.current = false;

    if (pullDistance >= pullThreshold && !isRefreshing) {
      setIsRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
      }
    }

    setPullDistance(0);
  }, [enabled, pullDistance, pullThreshold, isRefreshing, onRefresh]);

  useEffect(() => {
    const element = ref.current;
    if (!element || !enabled) return;

    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchmove', handleTouchMove, { passive: true });
    element.addEventListener('touchend', handleTouchEnd);
    element.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
      element.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd, enabled]);

  const pullProgress = Math.min(pullDistance / pullThreshold, 1);
  const shouldRefresh = pullDistance >= pullThreshold;

  return {
    ref,
    pullDistance,
    pullProgress,
    shouldRefresh,
    isRefreshing,
  };
}

/**
 * Hook to detect if device is touch-enabled
 */
export function useIsTouchDevice() {
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    const checkTouch = () => {
      setIsTouchDevice(
        'ontouchstart' in window ||
        navigator.maxTouchPoints > 0 ||
        // @ts-ignore - msMaxTouchPoints is IE-specific
        navigator.msMaxTouchPoints > 0
      );
    };

    checkTouch();
    window.addEventListener('touchstart', () => setIsTouchDevice(true), { once: true });
  }, []);

  return isTouchDevice;
}

/**
 * Hook for horizontal swipe navigation between items
 */
export interface UseSwipeNavigationOptions<T> {
  items: T[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
  loop?: boolean;
  enabled?: boolean;
}

export function useSwipeNavigation<T, E extends HTMLElement = HTMLElement>(
  options: UseSwipeNavigationOptions<T>
) {
  const { items, currentIndex, onIndexChange, loop = false, enabled = true } = options;

  const goToNext = useCallback(() => {
    const nextIndex = currentIndex + 1;
    if (nextIndex < items.length) {
      onIndexChange(nextIndex);
    } else if (loop) {
      onIndexChange(0);
    }
  }, [currentIndex, items.length, onIndexChange, loop]);

  const goToPrev = useCallback(() => {
    const prevIndex = currentIndex - 1;
    if (prevIndex >= 0) {
      onIndexChange(prevIndex);
    } else if (loop) {
      onIndexChange(items.length - 1);
    }
  }, [currentIndex, items.length, onIndexChange, loop]);

  const { ref, touchState, isGesturing } = useTouchGestures<E>({
    onSwipeLeft: goToNext,
    onSwipeRight: goToPrev,
    enabled,
  });

  return {
    ref,
    touchState,
    isGesturing,
    goToNext,
    goToPrev,
    canGoNext: loop || currentIndex < items.length - 1,
    canGoPrev: loop || currentIndex > 0,
  };
}
