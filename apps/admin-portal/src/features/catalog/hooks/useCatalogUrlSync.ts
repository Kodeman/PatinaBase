/**
 * useCatalogUrlSync Hook
 *
 * Synchronizes catalog state with URL query parameters for shareable links.
 * Enables users to bookmark or share catalog views with specific filters applied.
 *
 * Features:
 * - Bidirectional sync between state and URL
 * - Deep linking support
 * - History management (replaceState for non-navigation updates)
 * - Type-safe parameter handling
 *
 * @module features/catalog/hooks/useCatalogUrlSync
 */

'use client';

import { useEffect, useCallback } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';

/**
 * Catalog state that can be synchronized with URL
 */
export interface CatalogUrlState {
  /** Search query */
  q?: string;
  /** Status filter */
  status?: string;
  /** Category filter */
  category?: string;
  /** Brand filter */
  brand?: string;
  /** Current page */
  page?: number;
  /** Page size */
  pageSize?: number;
  /** Sort field */
  sortBy?: string;
  /** Sort order */
  sortOrder?: 'asc' | 'desc';
  /** View mode */
  view?: 'grid' | 'list' | 'table';
}

/**
 * Options for URL sync hook
 */
export interface UseCatalogUrlSyncOptions {
  /** Enable URL sync (default: true) */
  enabled?: boolean;
  /** Use push instead of replace for history (default: false) */
  usePushState?: boolean;
  /** Callback when URL params change */
  onParamsChange?: (params: CatalogUrlState) => void;
}

/**
 * Hook return type
 */
export interface UseCatalogUrlSyncResult {
  /** Update URL with new state */
  updateUrl: (state: Partial<CatalogUrlState>) => void;
  /** Get current state from URL */
  getStateFromUrl: () => CatalogUrlState;
  /** Clear all URL parameters */
  clearUrl: () => void;
}

/**
 * Hook for synchronizing catalog state with URL query parameters
 *
 * @param currentState - Current catalog state
 * @param options - Configuration options
 * @returns URL sync utilities
 */
export function useCatalogUrlSync(
  currentState: CatalogUrlState,
  options: UseCatalogUrlSyncOptions = {}
): UseCatalogUrlSyncResult {
  const { enabled = true, usePushState = false, onParamsChange } = options;

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  /**
   * Build URL search string from state
   */
  const buildUrlParams = useCallback((state: CatalogUrlState): string => {
    const params = new URLSearchParams();

    if (state.q) {
      params.set('q', state.q);
    }

    if (state.status) {
      params.set('status', state.status);
    }

    if (state.category) {
      params.set('category', state.category);
    }

    if (state.brand) {
      params.set('brand', state.brand);
    }

    if (state.page && state.page > 1) {
      params.set('page', state.page.toString());
    }

    if (state.pageSize && state.pageSize !== 20) {
      // Only include if not default
      params.set('pageSize', state.pageSize.toString());
    }

    if (state.sortBy && state.sortBy !== 'createdAt') {
      // Only include if not default
      params.set('sortBy', state.sortBy);
    }

    if (state.sortOrder && state.sortOrder !== 'desc') {
      // Only include if not default
      params.set('sortOrder', state.sortOrder);
    }

    if (state.view && state.view !== 'grid') {
      // Only include if not default
      params.set('view', state.view);
    }

    return params.toString();
  }, []);

  /**
   * Parse state from URL parameters
   */
  const getStateFromUrl = useCallback((): CatalogUrlState => {
    const state: CatalogUrlState = {};

    const q = searchParams.get('q');
    if (q) {
      state.q = q;
    }

    const status = searchParams.get('status');
    if (status) {
      state.status = status;
    }

    const category = searchParams.get('category');
    if (category) {
      state.category = category;
    }

    const brand = searchParams.get('brand');
    if (brand) {
      state.brand = brand;
    }

    const page = searchParams.get('page');
    if (page) {
      const pageNum = parseInt(page, 10);
      if (!isNaN(pageNum) && pageNum > 0) {
        state.page = pageNum;
      }
    }

    const pageSize = searchParams.get('pageSize');
    if (pageSize) {
      const size = parseInt(pageSize, 10);
      if (!isNaN(size) && size > 0) {
        state.pageSize = size;
      }
    }

    const sortBy = searchParams.get('sortBy');
    if (sortBy) {
      state.sortBy = sortBy;
    }

    const sortOrder = searchParams.get('sortOrder');
    if (sortOrder === 'asc' || sortOrder === 'desc') {
      state.sortOrder = sortOrder;
    }

    const view = searchParams.get('view');
    if (view === 'grid' || view === 'list' || view === 'table') {
      state.view = view;
    }

    return state;
  }, [searchParams]);

  /**
   * Update URL with new state
   */
  const updateUrl = useCallback(
    (state: Partial<CatalogUrlState>) => {
      if (!enabled) return;

      const newParams = buildUrlParams(state as CatalogUrlState);
      const newUrl = newParams ? `${pathname}?${newParams}` : pathname;

      if (usePushState) {
        router.push(newUrl as any);
      } else {
        router.replace(newUrl as any);
      }
    },
    [enabled, buildUrlParams, pathname, router, usePushState]
  );

  /**
   * Clear all URL parameters
   */
  const clearUrl = useCallback(() => {
    if (!enabled) return;
    router.replace(pathname as any);
  }, [enabled, pathname, router]);

  /**
   * Sync current state to URL whenever it changes
   */
  useEffect(() => {
    if (!enabled) return;

    const params = buildUrlParams(currentState);
    const currentParams = searchParams.toString();

    // Only update if params actually changed
    if (params !== currentParams) {
      const newUrl = params ? `${pathname}?${params}` : pathname;
      router.replace(newUrl as any);
    }
  }, [enabled, currentState, buildUrlParams, pathname, router, searchParams]);

  /**
   * Notify when URL params change (for loading state from URL on mount)
   */
  useEffect(() => {
    if (!enabled || !onParamsChange) return;

    const state = getStateFromUrl();
    onParamsChange(state);
  }, [enabled, searchParams, getStateFromUrl, onParamsChange]);

  return {
    updateUrl,
    getStateFromUrl,
    clearUrl,
  };
}
