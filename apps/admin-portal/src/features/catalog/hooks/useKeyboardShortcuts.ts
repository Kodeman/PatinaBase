/**
 * useKeyboardShortcuts Hook
 *
 * Provides keyboard shortcuts for power users in the catalog interface.
 * Supports common operations like search focus, filter toggle, selection, and navigation.
 *
 * Features:
 * - Cmd/Ctrl + K: Focus search
 * - Cmd/Ctrl + F: Toggle filters
 * - Cmd/Ctrl + A: Select all on page
 * - Escape: Clear selection or close modals
 * - Arrow keys: Navigate products (optional)
 * - Number keys: Quick page navigation (optional)
 *
 * @module features/catalog/hooks/useKeyboardShortcuts
 */

'use client';

import { useEffect, useRef } from 'react';

/**
 * Keyboard shortcut handlers
 */
export interface KeyboardShortcutHandlers {
  /** Focus search input */
  onFocusSearch?: () => void;
  /** Toggle filter panel */
  onToggleFilters?: () => void;
  /** Select all items on current page */
  onSelectAll?: () => void;
  /** Clear selection */
  onClearSelection?: () => void;
  /** Close active modal */
  onCloseModal?: () => void;
  /** Navigate to next page */
  onNextPage?: () => void;
  /** Navigate to previous page */
  onPrevPage?: () => void;
  /** Refresh data */
  onRefresh?: () => void;
}

/**
 * Options for keyboard shortcuts hook
 */
export interface UseKeyboardShortcutsOptions extends KeyboardShortcutHandlers {
  /** Enable keyboard shortcuts (default: true) */
  enabled?: boolean;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Hook for managing keyboard shortcuts in catalog
 *
 * @param options - Shortcut handlers and configuration
 */
export function useKeyboardShortcuts(options: UseKeyboardShortcutsOptions = {}): void {
  const {
    enabled = true,
    debug = false,
    onFocusSearch,
    onToggleFilters,
    onSelectAll,
    onClearSelection,
    onCloseModal,
    onNextPage,
    onPrevPage,
    onRefresh,
  } = options;

  // Track if we're in an input field
  const isInInputField = (target: EventTarget | null): boolean => {
    if (!target) return false;
    const element = target as HTMLElement;
    return (
      element.tagName === 'INPUT' ||
      element.tagName === 'TEXTAREA' ||
      element.isContentEditable
    );
  };

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const inInput = isInInputField(e.target);
      const isMod = e.metaKey || e.ctrlKey;
      const isShift = e.shiftKey;

      if (debug) {
        console.log('[KeyboardShortcuts]', {
          key: e.key,
          isMod,
          isShift,
          inInput,
          target: (e.target as HTMLElement)?.tagName,
        });
      }

      // Cmd/Ctrl + K: Focus search
      if (isMod && e.key === 'k') {
        e.preventDefault();
        if (onFocusSearch) {
          onFocusSearch();
        }
        return;
      }

      // Cmd/Ctrl + F: Toggle filters
      if (isMod && e.key === 'f') {
        e.preventDefault();
        if (onToggleFilters) {
          onToggleFilters();
        }
        return;
      }

      // Cmd/Ctrl + A: Select all (if not in input)
      if (isMod && e.key === 'a' && !inInput) {
        e.preventDefault();
        if (onSelectAll) {
          onSelectAll();
        }
        return;
      }

      // Cmd/Ctrl + R: Refresh data
      if (isMod && e.key === 'r') {
        e.preventDefault();
        if (onRefresh) {
          onRefresh();
        }
        return;
      }

      // Escape: Clear selection or close modal
      if (e.key === 'Escape') {
        if (onCloseModal) {
          onCloseModal();
        } else if (onClearSelection) {
          onClearSelection();
        }
        return;
      }

      // Arrow Right or ]: Next page (if not in input)
      if ((e.key === 'ArrowRight' || e.key === ']') && !inInput && isMod) {
        e.preventDefault();
        if (onNextPage) {
          onNextPage();
        }
        return;
      }

      // Arrow Left or [: Previous page (if not in input)
      if ((e.key === 'ArrowLeft' || e.key === '[') && !inInput && isMod) {
        e.preventDefault();
        if (onPrevPage) {
          onPrevPage();
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    enabled,
    debug,
    onFocusSearch,
    onToggleFilters,
    onSelectAll,
    onClearSelection,
    onCloseModal,
    onNextPage,
    onPrevPage,
    onRefresh,
  ]);
}

/**
 * Hook for managing search input focus
 *
 * Returns a ref to attach to the search input and a focus function.
 */
export function useSearchInputFocus() {
  const searchInputRef = useRef<HTMLInputElement>(null);

  const focusSearch = () => {
    if (searchInputRef.current) {
      searchInputRef.current.focus();
      searchInputRef.current.select();
    }
  };

  return {
    searchInputRef,
    focusSearch,
  };
}

/**
 * Get list of all available shortcuts for display in UI
 */
export function getShortcutsList(): Array<{
  keys: string[];
  description: string;
  category: 'navigation' | 'selection' | 'search' | 'data';
}> {
  const isMac = typeof window !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const mod = isMac ? '⌘' : 'Ctrl';

  return [
    {
      keys: [mod, 'K'],
      description: 'Focus search',
      category: 'search',
    },
    {
      keys: [mod, 'F'],
      description: 'Toggle filters',
      category: 'search',
    },
    {
      keys: [mod, 'A'],
      description: 'Select all on page',
      category: 'selection',
    },
    {
      keys: ['Escape'],
      description: 'Clear selection / Close modal',
      category: 'selection',
    },
    {
      keys: [mod, 'R'],
      description: 'Refresh data',
      category: 'data',
    },
    {
      keys: [mod, '→'],
      description: 'Next page',
      category: 'navigation',
    },
    {
      keys: [mod, '←'],
      description: 'Previous page',
      category: 'navigation',
    },
  ];
}
