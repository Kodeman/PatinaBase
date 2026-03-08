/**
 * useAdminCatalogPresenter Hook
 *
 * Main presenter hook that orchestrates the catalog page state and business logic.
 * Aggregates data from multiple hooks and provides a unified interface for catalog operations.
 *
 * Architecture:
 * - Coordinates useAdminProducts, useProductBulkActions, and useCatalogStats
 * - Manages local UI state (search, filters, pagination, view mode)
 * - Provides computed properties for empty states and loading states
 * - Handles all user interactions through action methods
 * - Persists user preferences to localStorage
 *
 * @module features/catalog/hooks/useAdminCatalogPresenter
 */

'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useAdminProducts } from '@/hooks/use-admin-products';
import { useProductBulkActions } from '@/hooks/use-product-bulk-actions';
import { useCatalogStats } from '@/hooks/use-catalog-stats';
import { useBulkOperationLock } from '@/hooks/useBulkOperationLock';
import type { AdminProductFilters, ProductListItem } from '@/types';

/**
 * View mode for catalog display
 */
type ViewMode = 'grid' | 'list' | 'table';

/**
 * Presenter hook return type
 */
export interface AdminCatalogPresenter {
  // ========== STATE ==========
  /** Current search query */
  searchQuery: string;
  /** Debounced search query (used for API calls) */
  debouncedSearchQuery: string;
  /** Current view mode */
  viewMode: ViewMode;
  /** Current page number (1-indexed) */
  currentPage: number;
  /** Number of items per page */
  pageSize: number;
  /** Current sort field */
  sortBy: string;
  /** Current sort order */
  sortOrder: 'asc' | 'desc';
  /** Currently selected status filter */
  selectedStatus: string | null;
  /** Currently selected category filter */
  selectedCategory: string | null;
  /** Currently selected brand filter */
  selectedBrand: string | null;
  /** Count of active filters */
  activeFilterCount: number;
  /** Whether any filters are active */
  hasActiveFilters: boolean;
  /** Number of selected products */
  selectedCount: number;
  /** Whether any products are selected */
  hasSelection: boolean;
  /** Array of selected product IDs */
  selectedProducts: string[];
  /** Whether a bulk operation is currently in progress */
  isOperationInProgress: boolean;
  /** Name of the current operation in progress */
  currentOperation: string | null;

  // ========== DATA ==========
  /** List of products */
  products: ProductListItem[];
  /** Whether products are loading */
  isLoadingProducts: boolean;
  /** Whether there was an error loading products */
  isError: boolean;
  /** Total number of products across all pages */
  totalProducts: number;
  /** Total number of pages */
  totalPages: number;
  /** Whether there is a next page */
  hasNextPage: boolean;
  /** Whether there is a previous page */
  hasPreviousPage: boolean;
  /** Catalog statistics */
  stats: any;
  /** Whether the product list is empty */
  isEmpty: boolean;
  /** True empty state (no products in catalog at all) */
  isEmptyState: boolean;
  /** No results state (filters applied but no matches) */
  isNoResults: boolean;

  // ========== MODAL STATE ==========
  /** Whether bulk publish modal is open */
  isPublishModalOpen: boolean;
  /** Whether bulk unpublish modal is open */
  isUnpublishModalOpen: boolean;
  /** Whether bulk delete modal is open */
  isDeleteModalOpen: boolean;

  // ========== SEARCH ACTIONS ==========
  /** Handle search query change */
  handleSearchChange: (query: string) => void;
  /** Clear search query */
  handleClearSearch: () => void;

  // ========== FILTER ACTIONS ==========
  /** Handle status filter change */
  handleStatusChange: (status: string | null) => void;
  /** Handle category filter change */
  handleCategoryChange: (category: string | null) => void;
  /** Handle brand filter change */
  handleBrandChange: (brand: string | null) => void;
  /** Clear all filters */
  handleClearFilters: () => void;

  // ========== PAGINATION ACTIONS ==========
  /** Change to specific page */
  handlePageChange: (page: number) => void;
  /** Change page size */
  handlePageSizeChange: (size: number) => void;

  // ========== SORTING ACTIONS ==========
  /** Handle sort change */
  handleSortChange: (field: string, order: 'asc' | 'desc') => void;

  // ========== VIEW ACTIONS ==========
  /** Set view mode */
  setViewMode: (mode: ViewMode) => void;

  // ========== BULK ACTIONS ==========
  /** Toggle product selection */
  handleProductToggle: (productId: string) => void;
  /** Select all products on current page */
  handleSelectAllOnPage: () => void;
  /** Clear all selections */
  handleClearSelection: () => void;
  /** Execute bulk publish */
  handleBulkPublish: () => Promise<any>;
  /** Execute bulk unpublish */
  handleBulkUnpublish: (reason?: string) => Promise<any>;
  /** Execute bulk delete */
  handleBulkDelete: () => Promise<any>;

  // ========== MODAL ACTIONS ==========
  /** Open publish modal */
  openPublishModal: () => void;
  /** Close publish modal */
  closePublishModal: () => void;
  /** Open unpublish modal */
  openUnpublishModal: () => void;
  /** Close unpublish modal */
  closeUnpublishModal: () => void;
  /** Open delete modal */
  openDeleteModal: () => void;
  /** Close delete modal */
  closeDeleteModal: () => void;

  // ========== DATA REFRESH ==========
  /** Refresh product data */
  refreshData: () => void;
  /** Refresh statistics */
  refreshStats: () => void;
}

/**
 * Main catalog presenter hook
 *
 * Orchestrates all catalog state and provides unified interface for the catalog page.
 */
export function useAdminCatalogPresenter(): AdminCatalogPresenter {
  // ========== LOCAL STATE ==========
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);

  // Modal state
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [isUnpublishModalOpen, setIsUnpublishModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  // ========== DEBOUNCE SEARCH ==========
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // ========== LOAD PREFERENCES FROM LOCALSTORAGE ==========
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedViewMode = localStorage.getItem('admin-catalog-view-mode');
      if (savedViewMode === 'grid' || savedViewMode === 'list' || savedViewMode === 'table') {
        setViewMode(savedViewMode);
      }

      const savedPageSize = localStorage.getItem('admin-catalog-page-size');
      if (savedPageSize) {
        const size = parseInt(savedPageSize, 10);
        if (!isNaN(size) && size > 0) {
          setPageSize(size);
        }
      }

      const savedSortBy = localStorage.getItem('admin-catalog-sort-by');
      if (savedSortBy) {
        setSortBy(savedSortBy);
      }

      const savedSortOrder = localStorage.getItem('admin-catalog-sort-order');
      if (savedSortOrder === 'asc' || savedSortOrder === 'desc') {
        setSortOrder(savedSortOrder);
      }
    }
  }, []);

  // ========== SAVE PREFERENCES TO LOCALSTORAGE ==========
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('admin-catalog-view-mode', viewMode);
    }
  }, [viewMode]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('admin-catalog-page-size', pageSize.toString());
    }
  }, [pageSize]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('admin-catalog-sort-by', sortBy);
    }
  }, [sortBy]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('admin-catalog-sort-order', sortOrder);
    }
  }, [sortOrder]);

  // ========== BUILD FILTERS ==========
  const filters = useMemo<AdminProductFilters>(() => {
    const f: AdminProductFilters = {
      page: currentPage,
      pageSize,
      sortBy: sortBy as any,
      sortOrder,
    };

    if (debouncedSearchQuery.trim()) {
      f.q = debouncedSearchQuery.trim();
    }

    if (selectedStatus) {
      f.status = selectedStatus as any;
    }

    if (selectedCategory) {
      f.categoryId = selectedCategory;
    }

    if (selectedBrand) {
      f.brand = selectedBrand;
    }

    return f;
  }, [currentPage, pageSize, sortBy, sortOrder, debouncedSearchQuery, selectedStatus, selectedCategory, selectedBrand]);

  // ========== DATA HOOKS ==========
  const productsQuery = useAdminProducts(filters);
  const bulkActions = useProductBulkActions({
    clearOnSuccess: true,
    onSuccess: (result) => {
      // Close modals on success
      setIsPublishModalOpen(false);
      setIsUnpublishModalOpen(false);
      setIsDeleteModalOpen(false);
    },
  });
  const statsQuery = useCatalogStats();
  const operationLock = useBulkOperationLock();

  // ========== COMPUTED VALUES ==========
  const products = productsQuery.products || [];
  const totalProducts = productsQuery.totalProducts || 0;
  const totalPages = productsQuery.totalPages || 0;
  const hasNextPage = productsQuery.hasNextPage || false;
  const hasPreviousPage = productsQuery.hasPreviousPage || false;
  const isLoadingProducts = productsQuery.isLoading || productsQuery.isFetching;
  const isError = productsQuery.isError;
  const stats = statsQuery.stats;

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedStatus) count++;
    if (selectedCategory) count++;
    if (selectedBrand) count++;
    return count;
  }, [selectedStatus, selectedCategory, selectedBrand]);

  const hasActiveFilters = activeFilterCount > 0 || searchQuery.trim().length > 0;

  const selectedCount = bulkActions.selectedCount;
  const hasSelection = bulkActions.hasSelection;
  const selectedProducts = bulkActions.selectedIds;

  // Empty states
  const isEmpty = products.length === 0;
  const isEmptyState = isEmpty && !hasActiveFilters;
  const isNoResults = isEmpty && hasActiveFilters;

  // ========== SEARCH ACTIONS ==========
  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
    setCurrentPage(1); // Reset to page 1 on search
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
    setDebouncedSearchQuery('');
    setCurrentPage(1);
  }, []);

  // ========== FILTER ACTIONS ==========
  const handleStatusChange = useCallback((status: string | null) => {
    setSelectedStatus(status);
    setCurrentPage(1); // Reset to page 1 on filter change
  }, []);

  const handleCategoryChange = useCallback((category: string | null) => {
    setSelectedCategory(category);
    setCurrentPage(1);
  }, []);

  const handleBrandChange = useCallback((brand: string | null) => {
    setSelectedBrand(brand);
    setCurrentPage(1);
  }, []);

  const handleClearFilters = useCallback(() => {
    setSelectedStatus(null);
    setSelectedCategory(null);
    setSelectedBrand(null);
    setCurrentPage(1);
  }, []);

  // ========== PAGINATION ACTIONS ==========
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setCurrentPage(1); // Reset to page 1 when changing page size
  }, []);

  // ========== SORTING ACTIONS ==========
  const handleSortChange = useCallback((field: string, order: 'asc' | 'desc') => {
    setSortBy(field);
    setSortOrder(order);
    setCurrentPage(1); // Reset to page 1 when changing sort
  }, []);

  // ========== BULK ACTIONS ==========
  const handleProductToggle = useCallback(
    (productId: string) => {
      bulkActions.toggleProduct(productId);
    },
    [bulkActions]
  );

  const handleSelectAllOnPage = useCallback(() => {
    const productIds = products.map((p) => p.id);
    bulkActions.selectAll(productIds);
  }, [products, bulkActions]);

  const handleClearSelection = useCallback(() => {
    bulkActions.clearSelection();
  }, [bulkActions]);

  const handleBulkPublish = useCallback(async () => {
    if (!operationLock.acquireLock('Bulk Publish')) {
      return; // Operation already in progress
    }

    try {
      return await bulkActions.bulkPublish();
    } finally {
      operationLock.releaseLock();
    }
  }, [bulkActions, operationLock]);

  const handleBulkUnpublish = useCallback(
    async (reason?: string) => {
      if (!operationLock.acquireLock('Bulk Unpublish')) {
        return;
      }

      try {
        return await bulkActions.bulkUnpublish(reason);
      } finally {
        operationLock.releaseLock();
      }
    },
    [bulkActions, operationLock]
  );

  const handleBulkDelete = useCallback(async () => {
    if (!operationLock.acquireLock('Bulk Delete')) {
      return;
    }

    try {
      return await bulkActions.bulkDelete();
    } finally {
      operationLock.releaseLock();
    }
  }, [bulkActions, operationLock]);

  // ========== MODAL ACTIONS ==========
  const openPublishModal = useCallback(() => {
    setIsPublishModalOpen(true);
  }, []);

  const closePublishModal = useCallback(() => {
    setIsPublishModalOpen(false);
  }, []);

  const openUnpublishModal = useCallback(() => {
    setIsUnpublishModalOpen(true);
  }, []);

  const closeUnpublishModal = useCallback(() => {
    setIsUnpublishModalOpen(false);
  }, []);

  const openDeleteModal = useCallback(() => {
    setIsDeleteModalOpen(true);
  }, []);

  const closeDeleteModal = useCallback(() => {
    setIsDeleteModalOpen(false);
  }, []);

  // ========== DATA REFRESH ==========
  const refreshData = useCallback(() => {
    productsQuery.refetch();
  }, [productsQuery]);

  const refreshStats = useCallback(() => {
    statsQuery.refetch();
  }, [statsQuery]);

  // ========== KEYBOARD SHORTCUTS ==========
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape: Clear selection or close modals
      if (e.key === 'Escape') {
        if (isPublishModalOpen) {
          closePublishModal();
        } else if (isUnpublishModalOpen) {
          closeUnpublishModal();
        } else if (isDeleteModalOpen) {
          closeDeleteModal();
        } else if (hasSelection) {
          handleClearSelection();
        }
      }

      // Cmd/Ctrl + A: Select all on page (if not in input)
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        const target = e.target as HTMLElement;
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          handleSelectAllOnPage();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isPublishModalOpen,
    isUnpublishModalOpen,
    isDeleteModalOpen,
    hasSelection,
    closePublishModal,
    closeUnpublishModal,
    closeDeleteModal,
    handleClearSelection,
    handleSelectAllOnPage,
  ]);

  // ========== RETURN PRESENTER INTERFACE ==========
  return {
    // State
    searchQuery,
    debouncedSearchQuery,
    viewMode,
    currentPage,
    pageSize,
    sortBy,
    sortOrder,
    selectedStatus,
    selectedCategory,
    selectedBrand,
    activeFilterCount,
    hasActiveFilters,
    selectedCount,
    hasSelection,
    selectedProducts,
    isOperationInProgress: operationLock.isLocked,
    currentOperation: operationLock.currentOperation,

    // Data
    products,
    isLoadingProducts,
    isError,
    totalProducts,
    totalPages,
    hasNextPage,
    hasPreviousPage,
    stats,
    isEmpty,
    isEmptyState,
    isNoResults,

    // Modal state
    isPublishModalOpen,
    isUnpublishModalOpen,
    isDeleteModalOpen,

    // Search actions
    handleSearchChange,
    handleClearSearch,

    // Filter actions
    handleStatusChange,
    handleCategoryChange,
    handleBrandChange,
    handleClearFilters,

    // Pagination actions
    handlePageChange,
    handlePageSizeChange,

    // Sorting actions
    handleSortChange,

    // View actions
    setViewMode,

    // Bulk actions
    handleProductToggle,
    handleSelectAllOnPage,
    handleClearSelection,
    handleBulkPublish,
    handleBulkUnpublish,
    handleBulkDelete,

    // Modal actions
    openPublishModal,
    closePublishModal,
    openUnpublishModal,
    closeUnpublishModal,
    openDeleteModal,
    closeDeleteModal,

    // Data refresh
    refreshData,
    refreshStats,
  };
}
