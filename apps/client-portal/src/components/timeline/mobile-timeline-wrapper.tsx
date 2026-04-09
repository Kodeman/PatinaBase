'use client';

/**
 * MobileTimelineWrapper - Touch-optimized wrapper for timeline
 * Provides pull-to-refresh, swipe navigation, and mobile-friendly interactions
 */

import { ReactNode, useCallback } from 'react';
import { RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { usePullToRefresh, useIsTouchDevice, useSwipeNavigation } from '@/hooks/use-touch-gestures';

interface MobileTimelineWrapperProps {
  children: ReactNode;
  onRefresh?: () => Promise<void>;
  className?: string;
}

export function MobileTimelineWrapper({
  children,
  onRefresh,
  className = '',
}: MobileTimelineWrapperProps) {
  const isTouchDevice = useIsTouchDevice();

  const handleRefresh = useCallback(async () => {
    if (onRefresh) {
      await onRefresh();
    }
  }, [onRefresh]);

  const { ref, pullDistance, pullProgress, shouldRefresh, isRefreshing } = usePullToRefresh<HTMLDivElement>({
    onRefresh: handleRefresh,
    pullThreshold: 80,
    maxPull: 120,
    enabled: isTouchDevice && !!onRefresh,
  });

  return (
    <div
      ref={ref}
      className={`relative overflow-auto touch-pan-y ${className}`}
      style={{
        // Optimize for touch scrolling
        WebkitOverflowScrolling: 'touch',
        overscrollBehavior: 'contain',
      }}
    >
      {/* Pull to refresh indicator */}
      {(pullDistance > 0 || isRefreshing) && (
        <div
          className="absolute top-0 left-0 right-0 flex items-center justify-center z-10"
          style={{
            height: Math.max(pullDistance, isRefreshing ? 60 : 0),
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
          }}
        >
          <div
            className={`flex items-center gap-2 ${
              shouldRefresh || isRefreshing ? 'text-primary-600' : 'text-gray-400'
            }`}
          >
            <RefreshCw className={`h-5 w-5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="text-sm font-medium">
              {isRefreshing
                ? 'Refreshing...'
                : shouldRefresh
                ? 'Release to refresh'
                : 'Pull to refresh'}
            </span>
          </div>
        </div>
      )}

      {/* Content */}
      <div style={{ transform: `translateY(${isRefreshing ? 60 : pullDistance}px)` }}>
        {children}
      </div>
    </div>
  );
}

/**
 * MobileSegmentNavigator - Swipe-enabled segment navigation
 */
interface Segment {
  id: string;
  title: string;
}

interface MobileSegmentNavigatorProps<T extends Segment> {
  segments: T[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
  renderSegment: (segment: T, index: number) => ReactNode;
  showIndicators?: boolean;
  showArrows?: boolean;
  className?: string;
}

export function MobileSegmentNavigator<T extends Segment>({
  segments,
  currentIndex,
  onIndexChange,
  renderSegment,
  showIndicators = true,
  showArrows = true,
  className = '',
}: MobileSegmentNavigatorProps<T>) {
  const isTouchDevice = useIsTouchDevice();

  const { ref, isGesturing, goToNext, goToPrev, canGoNext, canGoPrev } = useSwipeNavigation<T, HTMLDivElement>({
    items: segments,
    currentIndex,
    onIndexChange,
    loop: false,
    enabled: isTouchDevice,
  });

  const currentSegment = segments[currentIndex];

  return (
    <div className={`relative ${className}`}>
      {/* Navigation arrows (desktop and larger touch targets) */}
      {showArrows && (
        <>
          <button
            onClick={goToPrev}
            disabled={!canGoPrev}
            className={`absolute left-2 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-white/90 shadow-lg backdrop-blur-sm transition-all ${
              canGoPrev
                ? 'hover:bg-white hover:scale-110 text-gray-700'
                : 'opacity-40 cursor-not-allowed text-gray-400'
            }`}
            aria-label="Previous segment"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            onClick={goToNext}
            disabled={!canGoNext}
            className={`absolute right-2 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-white/90 shadow-lg backdrop-blur-sm transition-all ${
              canGoNext
                ? 'hover:bg-white hover:scale-110 text-gray-700'
                : 'opacity-40 cursor-not-allowed text-gray-400'
            }`}
            aria-label="Next segment"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      )}

      {/* Segment content */}
      <div
        ref={ref}
        className={`relative overflow-hidden ${isGesturing ? 'cursor-grabbing' : 'cursor-grab'}`}
      >
        {currentSegment && renderSegment(currentSegment, currentIndex)}
      </div>

      {/* Dot indicators */}
      {showIndicators && segments.length > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          {segments.map((segment, index) => (
            <button
              key={segment.id}
              onClick={() => onIndexChange(index)}
              className={`transition-all duration-200 rounded-full ${
                index === currentIndex
                  ? 'w-6 h-2 bg-primary-600'
                  : 'w-2 h-2 bg-gray-300 hover:bg-gray-400'
              }`}
              aria-label={`Go to ${segment.title}`}
              aria-current={index === currentIndex ? 'true' : 'false'}
            />
          ))}
        </div>
      )}

      {/* Touch hint for mobile users */}
      {isTouchDevice && segments.length > 1 && (
        <p className="text-center text-xs text-gray-400 mt-2">
          Swipe left or right to navigate
        </p>
      )}
    </div>
  );
}

/**
 * TouchFriendlyButton - Larger touch target button
 */
interface TouchFriendlyButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

export function TouchFriendlyButton({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  disabled = false,
  className = '',
  'aria-label': ariaLabel,
}: TouchFriendlyButtonProps) {
  const sizeClasses = {
    sm: 'min-h-[44px] min-w-[44px] px-4 py-2 text-sm',
    md: 'min-h-[48px] min-w-[48px] px-6 py-3 text-base',
    lg: 'min-h-[56px] min-w-[56px] px-8 py-4 text-lg',
  };

  const variantClasses = {
    primary: 'bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800',
    secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200 active:bg-gray-300',
    ghost: 'bg-transparent text-gray-700 hover:bg-gray-100 active:bg-gray-200',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`
        ${sizeClasses[size]}
        ${variantClasses[variant]}
        rounded-xl font-medium
        transition-all duration-150
        active:scale-95
        disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100
        touch-manipulation
        select-none
        ${className}
      `}
    >
      {children}
    </button>
  );
}

/**
 * MobileBottomSheet - Bottom sheet for mobile actions
 */
interface MobileBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

export function MobileBottomSheet({ isOpen, onClose, title, children }: MobileBottomSheetProps) {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/50 z-40"
      />

      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-xl max-h-[85vh] overflow-hidden">
        {/* Handle bar */}
        <div className="flex justify-center py-3">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* Title */}
        {title && (
          <div className="px-4 pb-3 border-b border-gray-100">
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          </div>
        )}

        {/* Content */}
        <div className="overflow-y-auto max-h-[70vh] p-4">
          {children}
        </div>

        {/* Safe area padding for iOS */}
        <div className="h-safe-area-bottom" />
      </div>
    </>
  );
}

export default MobileTimelineWrapper;
