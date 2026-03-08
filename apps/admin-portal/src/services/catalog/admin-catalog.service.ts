/**
 * Admin Catalog Service
 *
 * Enhanced catalog service with admin-specific capabilities:
 * - Response normalization for API resilience
 * - Bulk operations with concurrency control
 * - Validation management
 * - Catalog analytics and statistics
 * - Error handling with user feedback
 * - Retry logic for transient failures
 *
 * @module admin-catalog-service
 */

import { apiClient } from '@/lib/api-client';
import type { Product, Category, Collection, Vendor, PaginatedResponse, ApiResponse } from '@/types';
import type {
  BulkActionResult,
  BulkActionItemResult,
  CatalogStats,
  ProductValidationIssue,
} from '@/types/admin-catalog';

import {
  normalizeProductsResponse,
  normalizeSingleProductResponse,
  normalizeCategoriesResponse,
  normalizeProductValidationIssuesResponse,
} from './response-normalizers';
import { handleServiceError, showSuccessToast } from './error-handlers';
import { retryConfig, withRetry } from './retry-config';

const api = apiClient as any;

// ==================== CONSTANTS ====================

const MAX_BULK_BATCH_SIZE = 100;
const BULK_CONCURRENCY_LIMIT = 5; // Process 5 items at a time

// ==================== ADMIN CATALOG SERVICE ====================

/**
 * Extended catalog service with admin-specific methods
 */
export const adminCatalogService = {
  // ==================== BULK OPERATIONS ====================

  /**
   * Bulk publish multiple products
   * Validates batch size and processes with concurrency control
   */
  async bulkPublish(productIds: string[]): Promise<ApiResponse<BulkActionResult>> {
    try {
      // Validate input
      if (!productIds || productIds.length === 0) {
        throw new Error('Product IDs are required');
      }

      if (productIds.length > MAX_BULK_BATCH_SIZE) {
        throw new Error(`Maximum batch size is ${MAX_BULK_BATCH_SIZE} products`);
      }

      // Call backend bulk endpoint
      const response = await api.post('/v1/admin/catalog/bulk/publish', {
        productIds,
      });

      if (response.error) {
        throw response.error;
      }

      showSuccessToast(`Successfully published ${response.data.successful.length} products`);
      return response;
    } catch (error) {
      handleServiceError(error, 'Failed to publish products');
      throw error;
    }
  },

  /**
   * Bulk unpublish multiple products
   * Optionally includes a reason for unpublishing
   */
  async bulkUnpublish(productIds: string[], reason?: string): Promise<ApiResponse<BulkActionResult>> {
    try {
      // Validate input
      if (!productIds || productIds.length === 0) {
        throw new Error('Product IDs are required');
      }

      if (productIds.length > MAX_BULK_BATCH_SIZE) {
        throw new Error(`Maximum batch size is ${MAX_BULK_BATCH_SIZE} products`);
      }

      const payload: any = { productIds };
      if (reason) {
        payload.reason = reason;
      }

      // Call backend bulk endpoint
      const response = await api.post('/v1/admin/catalog/bulk/unpublish', payload);

      if (response.error) {
        throw response.error;
      }

      showSuccessToast(`Successfully unpublished ${response.data.successful.length} products`);
      return response;
    } catch (error) {
      handleServiceError(error, 'Failed to unpublish products');
      throw error;
    }
  },

  /**
   * Bulk delete multiple products
   * Supports soft delete option
   */
  async bulkDelete(productIds: string[], options?: { soft?: boolean }): Promise<ApiResponse<BulkActionResult>> {
    try {
      // Validate input
      if (!productIds || productIds.length === 0) {
        throw new Error('Product IDs are required');
      }

      if (productIds.length > MAX_BULK_BATCH_SIZE) {
        throw new Error(`Maximum batch size is ${MAX_BULK_BATCH_SIZE} products`);
      }

      const payload: any = { productIds };
      if (options?.soft) {
        payload.soft = true;
      }

      // Call backend bulk endpoint
      const response = await api.post('/v1/admin/catalog/bulk/delete', payload);

      if (response.error) {
        throw response.error;
      }

      showSuccessToast(`Successfully deleted ${response.data.successful.length} products`);
      return response;
    } catch (error) {
      handleServiceError(error, 'Failed to delete products');
      throw error;
    }
  },

  /**
   * Bulk update product status
   */
  async bulkUpdateStatus(productIds: string[], status: string): Promise<ApiResponse<BulkActionResult>> {
    try {
      // Validate input
      if (!productIds || productIds.length === 0) {
        throw new Error('Product IDs are required');
      }

      if (productIds.length > MAX_BULK_BATCH_SIZE) {
        throw new Error(`Maximum batch size is ${MAX_BULK_BATCH_SIZE} products`);
      }

      // Call backend bulk endpoint
      const response = await api.post('/v1/admin/catalog/bulk/update-status', {
        productIds,
        status,
      });

      if (response.error) {
        throw response.error;
      }

      showSuccessToast(`Successfully updated ${response.data.successful.length} products`);
      return response;
    } catch (error) {
      handleServiceError(error, 'Failed to update product status');
      throw error;
    }
  },

  // ==================== VALIDATION OPERATIONS ====================

  /**
   * Get validation summary for all products or filtered set
   */
  async getValidationSummary(filters?: {
    severity?: string;
    productId?: string;
  }): Promise<ApiResponse<any>> {
    try {
      const params = new URLSearchParams();
      if (filters?.severity) params.append('severity', filters.severity);
      if (filters?.productId) params.append('productId', filters.productId);

      const url = `/v1/admin/catalog/validation/summary${params.toString() ? '?' + params.toString() : ''}`;
      return await api.get(url);
    } catch (error) {
      handleServiceError(error, 'Failed to fetch validation summary');
      throw error;
    }
  },

  /**
   * Get validation issues for a specific product
   */
  async getProductValidationIssues(productId: string): Promise<ApiResponse<ProductValidationIssue[]>> {
    try {
      const response = await api.get(`/v1/admin/catalog/products/${productId}/validation`);

      if (response.error) {
        throw response.error;
      }

      return response;
    } catch (error) {
      handleServiceError(error, 'Failed to fetch product validation issues');
      throw error;
    }
  },

  /**
   * Resolve a validation issue
   */
  async resolveValidationIssue(issueId: string): Promise<ApiResponse<void>> {
    try {
      const response = await api.post(`/v1/admin/catalog/validation/issues/${issueId}/resolve`);

      if (response.error) {
        throw response.error;
      }

      showSuccessToast('Validation issue resolved');
      return response;
    } catch (error) {
      handleServiceError(error, 'Failed to resolve validation issue');
      throw error;
    }
  },

  // ==================== ANALYTICS & STATISTICS ====================

  /**
   * Get catalog-wide statistics
   */
  async getProductStats(filters?: {
    startDate?: string;
    endDate?: string;
    categoryId?: string;
  }): Promise<ApiResponse<CatalogStats>> {
    try {
      const params = new URLSearchParams();
      if (filters?.startDate) params.append('startDate', filters.startDate);
      if (filters?.endDate) params.append('endDate', filters.endDate);
      if (filters?.categoryId) params.append('categoryId', filters.categoryId);

      const url = `/v1/admin/catalog/stats${params.toString() ? '?' + params.toString() : ''}`;
      const response: any = await withRetry(
        () => api.get(url),
        retryConfig.standard
      );

      if (response.error) {
        throw response.error;
      }

      return response;
    } catch (error) {
      handleServiceError(error, 'Failed to fetch catalog statistics');
      throw error;
    }
  },

  /**
   * Get recent catalog activity
   */
  async getRecentActivity(params?: { limit?: number }): Promise<ApiResponse<any[]>> {
    try {
      const searchParams = new URLSearchParams();
      if (params?.limit) searchParams.append('limit', params.limit.toString());

      const url = `/v1/admin/catalog/activity${searchParams.toString() ? '?' + searchParams.toString() : ''}`;
      const response = await api.get(url);

      if (response.error) {
        throw response.error;
      }

      return response;
    } catch (error) {
      handleServiceError(error, 'Failed to fetch recent activity');
      throw error;
    }
  },

  // ==================== ERROR HANDLING & RETRY ====================

  /**
   * Retry a failed bulk operation
   */
  async retryFailedOperation(operationId: string): Promise<ApiResponse<any>> {
    try {
      const response = await api.post(`/v1/admin/catalog/operations/${operationId}/retry`);

      if (response.error) {
        throw response.error;
      }

      showSuccessToast('Operation retry initiated');
      return response;
    } catch (error) {
      handleServiceError(error, 'Failed to retry operation');
      throw error;
    }
  },

  /**
   * Get product with retry logic for transient failures
   */
  async getProductWithRetry(productId: string): Promise<ApiResponse<Product>> {
    try {
      return await withRetry(
        () => api.get(`/v1/products/${productId}`),
        retryConfig.standard
      );
    } catch (error) {
      handleServiceError(error, `Failed to fetch product ${productId}`);
      throw error;
    }
  },

  // ==================== ADVANCED FILTERING ====================

  /**
   * Get products with advanced filtering options
   * Supports multiple statuses, date ranges, validation filters
   */
  async getProducts(filters?: {
    q?: string;
    status?: string;
    statuses?: string[];
    category?: string;
    brand?: string;
    page?: number;
    pageSize?: number;
    createdAfter?: string;
    createdBefore?: string;
    hasValidationIssues?: boolean;
  }): Promise<ApiResponse<PaginatedResponse<Product>>> {
    try {
      const params = new URLSearchParams();

      if (filters?.q) params.append('q', filters.q);
      if (filters?.status) params.append('status', filters.status);
      if (filters?.statuses) params.append('statuses', filters.statuses.join(','));
      if (filters?.category) params.append('category', filters.category);
      if (filters?.brand) params.append('brand', filters.brand);
      if (filters?.page) params.append('page', filters.page.toString());
      if (filters?.pageSize) params.append('pageSize', filters.pageSize.toString());
      if (filters?.createdAfter) params.append('createdAfter', filters.createdAfter);
      if (filters?.createdBefore) params.append('createdBefore', filters.createdBefore);
      if (filters?.hasValidationIssues !== undefined) {
        params.append('hasValidationIssues', filters.hasValidationIssues.toString());
      }

      const response = await api.get(`/v1/products?${params.toString()}`);

      if (response.error) {
        throw response.error;
      }

      return response;
    } catch (error) {
      handleServiceError(error, 'Failed to fetch products');
      throw error;
    }
  },

  // ==================== EXPORT OPERATIONS ====================

  /**
   * Export products to CSV or JSON
   */
  async exportProducts(options: { format: 'csv' | 'json' }): Promise<ApiResponse<any>> {
    try {
      const params = new URLSearchParams();
      params.append('format', options.format);

      const response = await api.get(`/v1/admin/catalog/export?${params.toString()}`);

      if (response.error) {
        throw response.error;
      }

      showSuccessToast(`Products exported as ${options.format.toUpperCase()}`);
      return response;
    } catch (error) {
      handleServiceError(error, 'Failed to export products');
      throw error;
    }
  },
};
