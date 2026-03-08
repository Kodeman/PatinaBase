/**
 * Race Condition Prevention Tests
 *
 * Integration tests for concurrent bulk operation prevention
 * in the admin catalog presenter
 */

import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { useAdminCatalogPresenter } from '../useAdminCatalogPresenter';
import { catalogService } from '@/services/catalog';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';

// Mock dependencies
jest.mock('@/services/catalog');
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    warning: jest.fn(),
  },
}));

// Create wrapper for React Query
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('Race Condition Prevention', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Mock catalog service methods
    (catalogService.publishProduct as jest.Mock) = jest.fn().mockResolvedValue({ success: true });
    (catalogService.unpublishProduct as jest.Mock) = jest.fn().mockResolvedValue({ success: true });
    (catalogService.deleteProduct as jest.Mock) = jest.fn().mockResolvedValue({ success: true });
    (catalogService.updateProduct as jest.Mock) = jest.fn().mockResolvedValue({ success: true });
  });

  describe('Concurrent operation prevention', () => {
    it('should prevent concurrent bulk publish operations', async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useAdminCatalogPresenter(), { wrapper });

      // Select some products
      act(() => {
        result.current.handleProductToggle('product-1');
        result.current.handleProductToggle('product-2');
      });

      expect(result.current.selectedCount).toBe(2);
      expect(result.current.isOperationInProgress).toBe(false);

      // Start first bulk publish
      let firstPublishResult: any;
      act(() => {
        firstPublishResult = result.current.handleBulkPublish();
      });

      // Operation should be in progress
      expect(result.current.isOperationInProgress).toBe(true);
      expect(result.current.currentOperation).toBe('Bulk Publish');

      // Try to start second bulk publish (should be prevented)
      let secondPublishResult: any;
      act(() => {
        secondPublishResult = result.current.handleBulkPublish();
      });

      // Second operation should return undefined (blocked)
      expect(secondPublishResult).toBeUndefined();

      // Wait for first operation to complete
      await act(async () => {
        await firstPublishResult;
      });

      // Lock should be released
      expect(result.current.isOperationInProgress).toBe(false);
    });

    it('should prevent concurrent different bulk operations', async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useAdminCatalogPresenter(), { wrapper });

      // Select products
      act(() => {
        result.current.handleProductToggle('product-1');
      });

      // Start bulk publish
      let publishPromise: any;
      act(() => {
        publishPromise = result.current.handleBulkPublish();
      });

      expect(result.current.isOperationInProgress).toBe(true);
      expect(result.current.currentOperation).toBe('Bulk Publish');

      // Try to start bulk delete (should be prevented)
      let deleteResult: any;
      act(() => {
        deleteResult = result.current.handleBulkDelete();
      });

      expect(deleteResult).toBeUndefined();
      expect(result.current.currentOperation).toBe('Bulk Publish'); // Still publish

      // Try to start bulk unpublish (should be prevented)
      let unpublishResult: any;
      act(() => {
        unpublishResult = result.current.handleBulkUnpublish();
      });

      expect(unpublishResult).toBeUndefined();
      expect(result.current.currentOperation).toBe('Bulk Publish'); // Still publish

      await act(async () => {
        await publishPromise;
      });

      expect(result.current.isOperationInProgress).toBe(false);
    });

    it('should allow sequential operations after lock release', async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useAdminCatalogPresenter(), { wrapper });

      // Select products
      act(() => {
        result.current.handleProductToggle('product-1');
      });

      // First operation: Publish
      await act(async () => {
        await result.current.handleBulkPublish();
      });

      expect(result.current.isOperationInProgress).toBe(false);

      // Re-select (selection may be cleared)
      act(() => {
        result.current.handleProductToggle('product-1');
      });

      // Second operation: Unpublish (should succeed)
      let unpublishPromise: any;
      act(() => {
        unpublishPromise = result.current.handleBulkUnpublish();
      });

      expect(result.current.isOperationInProgress).toBe(true);
      expect(result.current.currentOperation).toBe('Bulk Unpublish');

      await act(async () => {
        await unpublishPromise;
      });

      expect(result.current.isOperationInProgress).toBe(false);
    });
  });

  describe('Error handling with locks', () => {
    it('should release lock on operation error', async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useAdminCatalogPresenter(), { wrapper });

      // Mock error
      (catalogService.publishProduct as jest.Mock) = jest.fn().mockRejectedValue(
        new Error('Publish failed')
      );

      // Select products
      act(() => {
        result.current.handleProductToggle('product-1');
      });

      // Start operation that will fail
      let errorThrown = false;
      await act(async () => {
        try {
          await result.current.handleBulkPublish();
        } catch {
          errorThrown = true;
        }
      });

      // Lock should be released even after error
      expect(result.current.isOperationInProgress).toBe(false);
      expect(result.current.currentOperation).toBeNull();
    });

    it('should allow new operation after error', async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useAdminCatalogPresenter(), { wrapper });

      // First operation fails
      (catalogService.publishProduct as jest.Mock) = jest.fn().mockRejectedValueOnce(
        new Error('First operation failed')
      );

      act(() => {
        result.current.handleProductToggle('product-1');
      });

      await act(async () => {
        try {
          await result.current.handleBulkPublish();
        } catch {}
      });

      expect(result.current.isOperationInProgress).toBe(false);

      // Second operation should succeed
      (catalogService.unpublishProduct as jest.Mock) = jest.fn().mockResolvedValue({ success: true });

      act(() => {
        result.current.handleProductToggle('product-1');
      });

      let secondOpResult: any;
      act(() => {
        secondOpResult = result.current.handleBulkUnpublish();
      });

      expect(secondOpResult).toBeDefined(); // Not blocked
      expect(result.current.isOperationInProgress).toBe(true);

      await act(async () => {
        await secondOpResult;
      });
    });
  });

  describe('Lock state consistency', () => {
    it('should maintain lock state during async operations', async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useAdminCatalogPresenter(), { wrapper });

      // Mock slow operation
      (catalogService.publishProduct as jest.Mock) = jest.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({ success: true }), 100);
          })
      );

      act(() => {
        result.current.handleProductToggle('product-1');
      });

      // Start operation
      let operationPromise: any;
      act(() => {
        operationPromise = result.current.handleBulkPublish();
      });

      expect(result.current.isOperationInProgress).toBe(true);

      // Check state multiple times during operation
      expect(result.current.currentOperation).toBe('Bulk Publish');

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(result.current.isOperationInProgress).toBe(true);

      await act(async () => {
        await operationPromise;
      });

      expect(result.current.isOperationInProgress).toBe(false);
    });

    it('should properly track operation names', async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useAdminCatalogPresenter(), { wrapper });

      act(() => {
        result.current.handleProductToggle('product-1');
      });

      // Test each operation type
      const operations = [
        { fn: 'handleBulkPublish', name: 'Bulk Publish' },
        { fn: 'handleBulkUnpublish', name: 'Bulk Unpublish' },
        { fn: 'handleBulkDelete', name: 'Bulk Delete' },
      ];

      for (const op of operations) {
        // Re-select product if needed
        act(() => {
          result.current.handleProductToggle('product-1');
        });

        await act(async () => {
          const promise = (result.current as any)[op.fn]();
          expect(result.current.currentOperation).toBe(op.name);
          await promise;
        });

        expect(result.current.isOperationInProgress).toBe(false);
      }
    });
  });

  describe('Multiple rapid attempts', () => {
    it('should block all concurrent attempts', async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useAdminCatalogPresenter(), { wrapper });

      act(() => {
        result.current.handleProductToggle('product-1');
      });

      // Start first operation
      let firstPromise: any;
      act(() => {
        firstPromise = result.current.handleBulkPublish();
      });

      // Try to start 5 more operations rapidly
      const blockedResults: any[] = [];
      act(() => {
        blockedResults.push(result.current.handleBulkPublish());
        blockedResults.push(result.current.handleBulkDelete());
        blockedResults.push(result.current.handleBulkUnpublish());
        blockedResults.push(result.current.handleBulkPublish());
        blockedResults.push(result.current.handleBulkDelete());
      });

      // All should be undefined (blocked)
      blockedResults.forEach((result) => {
        expect(result).toBeUndefined();
      });

      await act(async () => {
        await firstPromise;
      });

      expect(result.current.isOperationInProgress).toBe(false);
    });
  });
});
