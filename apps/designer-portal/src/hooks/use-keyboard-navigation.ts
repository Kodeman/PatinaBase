'use client';

import { useEffect, useCallback, useRef } from 'react';

export interface UseKeyboardNavigationOptions {
  enabled?: boolean;
  gridColumns?: number;
  itemCount: number;
  onSelect?: (index: number) => void;
  onEscape?: () => void;
  focusOnMount?: boolean;
}

/**
 * Hook for keyboard navigation in a grid layout
 * Supports arrow keys, Enter, Escape, Home, End, Page Up/Down
 */
export function useKeyboardNavigation({
  enabled = true,
  gridColumns = 4,
  itemCount,
  onSelect,
  onEscape,
  focusOnMount = false,
}: UseKeyboardNavigationOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const currentIndexRef = useRef<number>(-1);

  const focusItem = useCallback((index: number) => {
    if (!containerRef.current) return;

    const items = containerRef.current.querySelectorAll('[data-keyboard-nav-item]');
    const item = items[index] as HTMLElement;

    if (item) {
      item.focus();
      currentIndexRef.current = index;

      // Scroll into view if needed
      item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, []);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabled || !containerRef.current) return;

    const items = containerRef.current.querySelectorAll('[data-keyboard-nav-item]');
    const currentIndex = currentIndexRef.current;
    let newIndex = currentIndex;

    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault();
        newIndex = Math.min(currentIndex + 1, itemCount - 1);
        break;

      case 'ArrowLeft':
        event.preventDefault();
        newIndex = Math.max(currentIndex - 1, 0);
        break;

      case 'ArrowDown':
        event.preventDefault();
        newIndex = Math.min(currentIndex + gridColumns, itemCount - 1);
        break;

      case 'ArrowUp':
        event.preventDefault();
        newIndex = Math.max(currentIndex - gridColumns, 0);
        break;

      case 'Home':
        event.preventDefault();
        newIndex = 0;
        break;

      case 'End':
        event.preventDefault();
        newIndex = itemCount - 1;
        break;

      case 'PageDown':
        event.preventDefault();
        newIndex = Math.min(currentIndex + gridColumns * 3, itemCount - 1);
        break;

      case 'PageUp':
        event.preventDefault();
        newIndex = Math.max(currentIndex - gridColumns * 3, 0);
        break;

      case 'Enter':
        event.preventDefault();
        if (currentIndex >= 0 && onSelect) {
          onSelect(currentIndex);
        }
        break;

      case 'Escape':
        event.preventDefault();
        if (onEscape) {
          onEscape();
        }
        break;

      default:
        return;
    }

    if (newIndex !== currentIndex) {
      focusItem(newIndex);
    }
  }, [enabled, gridColumns, itemCount, onSelect, onEscape, focusItem]);

  useEffect(() => {
    if (!enabled) return;

    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('keydown', handleKeyDown);

    // Focus first item on mount if requested
    if (focusOnMount && itemCount > 0) {
      setTimeout(() => focusItem(0), 100);
    }

    return () => {
      container.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, handleKeyDown, focusOnMount, itemCount, focusItem]);

  return {
    containerRef,
    currentIndex: currentIndexRef.current,
    focusItem,
  };
}
