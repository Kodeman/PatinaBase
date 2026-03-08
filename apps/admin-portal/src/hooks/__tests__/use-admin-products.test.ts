/**
 * useAdminProducts Hook Tests
 *
 * TDD Phase 1: FAILING TESTS for admin product fetching hook
 * This hook will handle fetching products with admin-specific filters and pagination
 *
 * TODO: Implement useAdminProducts hook in src/hooks/use-admin-products.ts
 */

import { renderHook, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils/render';
import { catalogService } from '@/services/catalog';
import {
  createMockProducts,
  createMockPaginatedResponse,
  createMockApiError,
} from '@/test-utils';

// Mock the catalog service
jest.mock('@/services/catalog');

// Import the hook that doesn't exist yet
// TODO: This import will FAIL until the hook is created
const useAdminProducts = require('@/hooks/use-admin-products').useAdminProducts;

describe('useAdminProducts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic product fetching', () => {
    it('should fetch products successfully', async () => {
      // TODO: This test will FAIL - hook doesn't exist yet
      const mockProducts = createMockProducts(10);
      const mockResponse = createMockPaginatedResponse(mockProducts);

      (catalogService.getProducts as jest.Mock).mockResolvedValueOnce({
        data: mockResponse,
      });

      const { result } = renderHook(() => useAdminProducts(), {
        wrapper: ({ children }) => renderWithProviders(children as any).container,
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.data).toHaveLength(10);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should start in loading state', () => {
      // TODO: This test will FAIL - hook doesn't exist yet
      (catalogService.getProducts as jest.Mock).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      const { result } = renderHook(() => useAdminProducts(), {
        wrapper: ({ children }) => renderWithProviders(children as any).container,
      });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.data).toBeUndefined();
    });

    it('should handle errors gracefully', async () => {
      // TODO: This test will FAIL - hook doesn't exist yet
      const mockError = createMockApiError({
        code: 'SERVER_ERROR',
        message: 'Failed to fetch products',
      });

      (catalogService.getProducts as jest.Mock).mockResolvedValueOnce({
        error: mockError,
      });

      const { result } = renderHook(() => useAdminProducts(), {
        wrapper: ({ children }) => renderWithProviders(children as any).container,
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeDefined();
      expect(result.current.data).toBeUndefined();
    });
  });

  describe('Filtering', () => {
    it('should filter products by status', async () => {
      // TODO: This test will FAIL - filtering not implemented
      const mockProducts = createMockProducts(5);
      const mockResponse = createMockPaginatedResponse(mockProducts);

      (catalogService.getProducts as jest.Mock).mockResolvedValueOnce({
        data: mockResponse,
      });

      const { result } = renderHook(
        () => useAdminProducts({ status: 'draft' }),
        {
          wrapper: ({ children }) => renderWithProviders(children as any).container,
        }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(catalogService.getProducts).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'draft' })
      );
    });

    it('should filter products by search query', async () => {
      // TODO: This test will FAIL - search filtering not implemented
      const mockProducts = createMockProducts(3);
      const mockResponse = createMockPaginatedResponse(mockProducts);

      (catalogService.getProducts as jest.Mock).mockResolvedValueOnce({
        data: mockResponse,
      });

      const { result } = renderHook(
        () => useAdminProducts({ query: 'modern sofa' }),
        {
          wrapper: ({ children }) => renderWithProviders(children as any).container,
        }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(catalogService.getProducts).toHaveBeenCalledWith(
        expect.objectContaining({ query: 'modern sofa' })
      );
    });

    it('should filter products by category', async () => {
      // TODO: This test will FAIL - category filtering not implemented
      const mockProducts = createMockProducts(5);
      const mockResponse = createMockPaginatedResponse(mockProducts);

      (catalogService.getProducts as jest.Mock).mockResolvedValueOnce({
        data: mockResponse,
      });

      const { result } = renderHook(
        () => useAdminProducts({ category: 'seating' }),
        {
          wrapper: ({ children }) => renderWithProviders(children as any).container,
        }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(catalogService.getProducts).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'seating' })
      );
    });

    it('should filter products by brand', async () => {
      // TODO: This test will FAIL - brand filtering not implemented
      const mockProducts = createMockProducts(5);
      const mockResponse = createMockPaginatedResponse(mockProducts);

      (catalogService.getProducts as jest.Mock).mockResolvedValueOnce({
        data: mockResponse,
      });

      const { result } = renderHook(
        () => useAdminProducts({ brand: 'ModernCo' }),
        {
          wrapper: ({ children }) => renderWithProviders(children as any).container,
        }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(catalogService.getProducts).toHaveBeenCalledWith(
        expect.objectContaining({ brand: 'ModernCo' })
      );
    });

    it('should combine multiple filters', async () => {
      // TODO: This test will FAIL - multi-filter not implemented
      const mockProducts = createMockProducts(2);
      const mockResponse = createMockPaginatedResponse(mockProducts);

      (catalogService.getProducts as jest.Mock).mockResolvedValueOnce({
        data: mockResponse,
      });

      const { result } = renderHook(
        () =>
          useAdminProducts({
            status: 'published',
            category: 'seating',
            brand: 'ModernCo',
            query: 'sofa',
          }),
        {
          wrapper: ({ children }) => renderWithProviders(children as any).container,
        }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(catalogService.getProducts).toHaveBeenCalledWith({
        status: 'published',
        category: 'seating',
        brand: 'ModernCo',
        query: 'sofa',
        page: 1,
        pageSize: 20,
      });
    });

    it('should filter products with validation issues', async () => {
      // TODO: This test will FAIL - validation issue filtering not implemented
      const mockProducts = createMockProducts(3);
      const mockResponse = createMockPaginatedResponse(mockProducts);

      (catalogService.getProducts as jest.Mock).mockResolvedValueOnce({
        data: mockResponse,
      });

      const { result } = renderHook(
        () => useAdminProducts({ hasValidationIssues: true }),
        {
          wrapper: ({ children }) => renderWithProviders(children as any).container,
        }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(catalogService.getProducts).toHaveBeenCalledWith(
        expect.objectContaining({ hasValidationIssues: true })
      );
    });
  });

  describe('Pagination', () => {
    it('should handle pagination correctly', async () => {
      // TODO: This test will FAIL - pagination not implemented
      const mockProducts = createMockProducts(20);
      const mockResponse = createMockPaginatedResponse(mockProducts, {
        meta: { page: 2, pageSize: 20, total: 100, totalPages: 5 },
      });

      (catalogService.getProducts as jest.Mock).mockResolvedValueOnce({
        data: mockResponse,
      });

      const { result } = renderHook(
        () => useAdminProducts({ page: 2, pageSize: 20 }),
        {
          wrapper: ({ children }) => renderWithProviders(children as any).container,
        }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(catalogService.getProducts).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2, pageSize: 20 })
      );
      expect(result.current.data?.meta?.page).toBe(2);
      expect(result.current.data?.meta?.totalPages).toBe(5);
    });

    it('should default to page 1 and pageSize 20', async () => {
      // TODO: This test will FAIL - defaults not implemented
      const mockProducts = createMockProducts(10);
      const mockResponse = createMockPaginatedResponse(mockProducts);

      (catalogService.getProducts as jest.Mock).mockResolvedValueOnce({
        data: mockResponse,
      });

      const { result } = renderHook(() => useAdminProducts(), {
        wrapper: ({ children }) => renderWithProviders(children as any).container,
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(catalogService.getProducts).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, pageSize: 20 })
      );
    });

    it('should support custom page sizes', async () => {
      // TODO: This test will FAIL - custom page sizes not implemented
      const mockProducts = createMockProducts(50);
      const mockResponse = createMockPaginatedResponse(mockProducts);

      (catalogService.getProducts as jest.Mock).mockResolvedValueOnce({
        data: mockResponse,
      });

      const { result } = renderHook(
        () => useAdminProducts({ pageSize: 50 }),
        {
          wrapper: ({ children }) => renderWithProviders(children as any).container,
        }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(catalogService.getProducts).toHaveBeenCalledWith(
        expect.objectContaining({ pageSize: 50 })
      );
    });
  });

  describe('Refetching and cache invalidation', () => {
    it('should expose a refetch function', async () => {
      // TODO: This test will FAIL - refetch not exposed
      const mockProducts = createMockProducts(5);
      const mockResponse = createMockPaginatedResponse(mockProducts);

      (catalogService.getProducts as jest.Mock).mockResolvedValue({
        data: mockResponse,
      });

      const { result } = renderHook(() => useAdminProducts(), {
        wrapper: ({ children }) => renderWithProviders(children as any).container,
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(typeof result.current.refetch).toBe('function');

      await result.current.refetch();

      expect(catalogService.getProducts).toHaveBeenCalledTimes(2);
    });

    it('should support enabled/disabled queries', async () => {
      // TODO: This test will FAIL - enabled option not supported
      const { result } = renderHook(
        () => useAdminProducts({ enabled: false }),
        {
          wrapper: ({ children }) => renderWithProviders(children as any).container,
        }
      );

      // Should not fetch when disabled
      await waitFor(() => {
        expect(catalogService.getProducts).not.toHaveBeenCalled();
      });

      expect(result.current.data).toBeUndefined();
    });

    it('should use proper cache keys for different filters', async () => {
      // TODO: This test will FAIL - cache key generation not implemented
      const mockResponse = createMockPaginatedResponse(createMockProducts(5));

      (catalogService.getProducts as jest.Mock).mockResolvedValue({
        data: mockResponse,
      });

      const { result: result1 } = renderHook(
        () => useAdminProducts({ status: 'draft' }),
        {
          wrapper: ({ children }) => renderWithProviders(children as any).container,
        }
      );

      const { result: result2 } = renderHook(
        () => useAdminProducts({ status: 'published' }),
        {
          wrapper: ({ children }) => renderWithProviders(children as any).container,
        }
      );

      await waitFor(() => {
        expect(result1.current.isSuccess).toBe(true);
        expect(result2.current.isSuccess).toBe(true);
      });

      // Should have made two separate requests due to different cache keys
      expect(catalogService.getProducts).toHaveBeenCalledTimes(2);
    });
  });

  describe('Sorting', () => {
    it('should sort products by name ascending', async () => {
      // TODO: This test will FAIL - sorting not implemented
      const mockProducts = createMockProducts(5);
      const mockResponse = createMockPaginatedResponse(mockProducts);

      (catalogService.getProducts as jest.Mock).mockResolvedValueOnce({
        data: mockResponse,
      });

      const { result } = renderHook(
        () => useAdminProducts({ sortBy: 'name', sortOrder: 'asc' }),
        {
          wrapper: ({ children }) => renderWithProviders(children as any).container,
        }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(catalogService.getProducts).toHaveBeenCalledWith(
        expect.objectContaining({ sortBy: 'name', sortOrder: 'asc' })
      );
    });

    it('should sort products by createdAt descending', async () => {
      // TODO: This test will FAIL - date sorting not implemented
      const mockProducts = createMockProducts(5);
      const mockResponse = createMockPaginatedResponse(mockProducts);

      (catalogService.getProducts as jest.Mock).mockResolvedValueOnce({
        data: mockResponse,
      });

      const { result } = renderHook(
        () => useAdminProducts({ sortBy: 'createdAt', sortOrder: 'desc' }),
        {
          wrapper: ({ children }) => renderWithProviders(children as any).container,
        }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(catalogService.getProducts).toHaveBeenCalledWith(
        expect.objectContaining({ sortBy: 'createdAt', sortOrder: 'desc' })
      );
    });
  });

  describe('Empty states', () => {
    it('should handle empty product list', async () => {
      // TODO: This test will FAIL - empty state handling not implemented
      const mockResponse = createMockPaginatedResponse([]);

      (catalogService.getProducts as jest.Mock).mockResolvedValueOnce({
        data: mockResponse,
      });

      const { result } = renderHook(() => useAdminProducts(), {
        wrapper: ({ children }) => renderWithProviders(children as any).container,
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.data).toHaveLength(0);
      expect(result.current.data?.meta?.total).toBe(0);
    });

    it('should indicate when no results match filters', async () => {
      // TODO: This test will FAIL - no results indicator not implemented
      const mockResponse = createMockPaginatedResponse([]);

      (catalogService.getProducts as jest.Mock).mockResolvedValueOnce({
        data: mockResponse,
      });

      const { result } = renderHook(
        () => useAdminProducts({ query: 'nonexistent product' }),
        {
          wrapper: ({ children }) => renderWithProviders(children as any).container,
        }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.isEmpty).toBe(true);
      expect(result.current.hasFilters).toBe(true);
    });
  });

  describe('Performance and optimization', () => {
    it('should use stale-while-revalidate caching', async () => {
      // TODO: This test will FAIL - SWR caching not configured
      const mockProducts = createMockProducts(5);
      const mockResponse = createMockPaginatedResponse(mockProducts);

      (catalogService.getProducts as jest.Mock).mockResolvedValue({
        data: mockResponse,
      });

      const { result, rerender } = renderHook(() => useAdminProducts(), {
        wrapper: ({ children }) => renderWithProviders(children as any).container,
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // First render should fetch
      expect(catalogService.getProducts).toHaveBeenCalledTimes(1);

      // Rerender should use cached data
      rerender();
      expect(catalogService.getProducts).toHaveBeenCalledTimes(1);
    });

    it('should support manual cache invalidation', async () => {
      // TODO: This test will FAIL - invalidation not implemented
      const mockProducts = createMockProducts(5);
      const mockResponse = createMockPaginatedResponse(mockProducts);

      (catalogService.getProducts as jest.Mock).mockResolvedValue({
        data: mockResponse,
      });

      const { result } = renderHook(() => useAdminProducts(), {
        wrapper: ({ children }) => renderWithProviders(children as any).container,
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Should expose invalidate function
      expect(typeof result.current.invalidate).toBe('function');

      await result.current.invalidate();

      // Should refetch after invalidation
      expect(catalogService.getProducts).toHaveBeenCalledTimes(2);
    });
  });
});
