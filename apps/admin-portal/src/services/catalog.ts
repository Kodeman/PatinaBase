import { catalogApi } from '@/lib/api-client';
import type { Product, Variant, Category, PaginatedResponse, ApiResponse } from '@/types';
import type { BulkActionResult, CatalogStats, ProductValidationIssue } from '@/types/admin-catalog';
import {
  BulkPublishSchema,
  BulkUnpublishSchema,
  BulkDeleteSchema,
  BulkUpdateStatusSchema,
  validateProductIds,
} from '@/lib/validation/bulk-operations';
import { rateLimiter, RATE_LIMITS } from '@/lib/security/rate-limiter';
import { z } from 'zod';

// Constants
const MAX_BULK_BATCH_SIZE = 100;

export const catalogService = {
  // Products
  async getProducts(params?: {
    query?: string;
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
    // Build params object for CatalogApiClient
    const apiParams: Record<string, unknown> = {};
    if (params?.query) apiParams.q = params.query;
    if (params?.status) apiParams.status = params.status;
    if (params?.statuses) apiParams.statuses = params.statuses.join(',');
    if (params?.category) apiParams.category = params.category;
    if (params?.brand) apiParams.brand = params.brand;
    if (params?.page) apiParams.page = params.page;
    if (params?.pageSize) apiParams.pageSize = params.pageSize;
    if (params?.createdAfter) apiParams.createdAfter = params.createdAfter;
    if (params?.createdBefore) apiParams.createdBefore = params.createdBefore;
    if (params?.hasValidationIssues !== undefined) {
      apiParams.hasValidationIssues = params.hasValidationIssues;
    }

    return catalogApi.getProducts(apiParams) as Promise<ApiResponse<PaginatedResponse<Product>>>;
  },

  async getProduct(productId: string): Promise<ApiResponse<Product>> {
    return catalogApi.getProduct(productId) as Promise<ApiResponse<Product>>;
  },

  async createProduct(data: Partial<Product>): Promise<ApiResponse<Product>> {
    return catalogApi.createProduct(data as Record<string, unknown>) as Promise<ApiResponse<Product>>;
  },

  async updateProduct(productId: string, data: Partial<Product>): Promise<ApiResponse<Product>> {
    return catalogApi.updateProduct(productId, data as Record<string, unknown>) as Promise<ApiResponse<Product>>;
  },

  async deleteProduct(productId: string): Promise<ApiResponse<void>> {
    return catalogApi.deleteProduct(productId) as Promise<ApiResponse<void>>;
  },

  async publishProduct(productId: string): Promise<ApiResponse<void>> {
    return catalogApi.publishProduct(productId) as Promise<ApiResponse<void>>;
  },

  async unpublishProduct(productId: string): Promise<ApiResponse<void>> {
    return catalogApi.unpublishProduct(productId) as Promise<ApiResponse<void>>;
  },

  // Variants
  async createVariant(productId: string, data: Partial<Variant>): Promise<ApiResponse<Variant>> {
    // Use base client for variant creation (not exposed in catalogApi interface yet)
    return catalogApi['post'](`/products/${productId}/variants`, data) as Promise<ApiResponse<Variant>>;
  },

  async updateVariant(variantId: string, data: Partial<Variant>): Promise<ApiResponse<Variant>> {
    // Variants are updated through product-scoped endpoint
    return catalogApi['patch'](`/variants/${variantId}`, data) as Promise<ApiResponse<Variant>>;
  },

  async deleteVariant(variantId: string): Promise<ApiResponse<void>> {
    return catalogApi['delete'](`/variants/${variantId}`) as Promise<ApiResponse<void>>;
  },

  // Categories
  async getCategories(): Promise<ApiResponse<Category[]>> {
    return catalogApi.getCategories() as Promise<ApiResponse<Category[]>>;
  },

  async getCategory(categoryId: string): Promise<ApiResponse<Category>> {
    return catalogApi.getCategory(categoryId) as Promise<ApiResponse<Category>>;
  },

  async createCategory(data: Partial<Category>): Promise<ApiResponse<Category>> {
    return catalogApi.createCategory(data as any) as Promise<ApiResponse<Category>>;
  },

  async updateCategory(categoryId: string, data: Partial<Category>): Promise<ApiResponse<Category>> {
    return catalogApi.updateCategory(categoryId, data as Record<string, unknown>) as Promise<ApiResponse<Category>>;
  },

  async deleteCategory(categoryId: string): Promise<ApiResponse<void>> {
    return catalogApi.deleteCategory(categoryId) as Promise<ApiResponse<void>>;
  },

  // Validation Issues
  async getValidationIssues(params?: {
    productId?: string;
    severity?: string;
    status?: string;
  }): Promise<ApiResponse<any[]>> {
    const apiParams: Record<string, unknown> = {};
    if (params?.productId) apiParams.productId = params.productId;
    if (params?.severity) apiParams.severity = params.severity;
    if (params?.status) apiParams.status = params.status;

    return catalogApi['get']('/admin/catalog/issues', { params: apiParams }) as Promise<ApiResponse<any[]>>;
  },

  // Import
  async createImportJob(data: {
    source: string;
    mapping: any;
    file?: File;
  }): Promise<ApiResponse<any>> {
    return catalogApi['post']('/imports', data) as Promise<ApiResponse<any>>;
  },

  async getImportJob(jobId: string): Promise<ApiResponse<any>> {
    return catalogApi['get'](`/imports/${jobId}`) as Promise<ApiResponse<any>>;
  },

  async getImportJobs(): Promise<ApiResponse<PaginatedResponse<any>>> {
    return catalogApi['get']('/imports') as Promise<ApiResponse<PaginatedResponse<any>>>;
  },

  async retryImportJob(jobId: string): Promise<ApiResponse<void>> {
    return catalogApi['post'](`/imports/${jobId}/retry`) as Promise<ApiResponse<void>>;
  },

  // ==================== BULK OPERATIONS ====================

  async bulkPublish(productIds: string[]): Promise<ApiResponse<BulkActionResult>> {
    // Rate limit check
    if (!rateLimiter.canProceed('bulk-publish', RATE_LIMITS.bulkOperations)) {
      const timeUntilReset = rateLimiter.getTimeUntilReset('bulk-publish', RATE_LIMITS.bulkOperations);
      const secondsUntilReset = Math.ceil(timeUntilReset / 1000);
      throw new Error(
        `Rate limit exceeded. Please wait ${secondsUntilReset} seconds before trying again.`
      );
    }

    // Validate input
    try {
      const validated = BulkPublishSchema.parse({ productIds });

      // Proceed with validated data
      return catalogApi['post']('/admin/catalog/bulk/publish', {
        productIds: validated.productIds,
      }) as Promise<ApiResponse<BulkActionResult>>;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issues = error.issues.map(i => i.message).join(', ');
        throw new Error(`Validation failed: ${issues}`);
      }
      throw error;
    }
  },

  async bulkUnpublish(productIds: string[], reason?: string): Promise<ApiResponse<BulkActionResult>> {
    // Rate limit check
    if (!rateLimiter.canProceed('bulk-unpublish', RATE_LIMITS.bulkOperations)) {
      const timeUntilReset = rateLimiter.getTimeUntilReset('bulk-unpublish', RATE_LIMITS.bulkOperations);
      const secondsUntilReset = Math.ceil(timeUntilReset / 1000);
      throw new Error(
        `Rate limit exceeded. Please wait ${secondsUntilReset} seconds before trying again.`
      );
    }

    // Validate input with reason if provided
    try {
      const payload: { productIds: string[]; reason?: string } = {
        productIds,
      };

      if (reason) {
        // Validate with reason required
        const validated = BulkUnpublishSchema.parse({ productIds, reason });
        payload.productIds = validated.productIds;
        payload.reason = validated.reason;
      } else {
        // Validate without reason
        const validated = BulkPublishSchema.parse({ productIds });
        payload.productIds = validated.productIds;
      }

      return catalogApi['post']('/admin/catalog/bulk/unpublish', payload) as Promise<ApiResponse<BulkActionResult>>;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issues = error.issues.map(i => i.message).join(', ');
        throw new Error(`Validation failed: ${issues}`);
      }
      throw error;
    }
  },

  async bulkDelete(productIds: string[], options?: { soft?: boolean }): Promise<ApiResponse<BulkActionResult>> {
    // Rate limit check
    if (!rateLimiter.canProceed('bulk-delete', RATE_LIMITS.bulkOperations)) {
      const timeUntilReset = rateLimiter.getTimeUntilReset('bulk-delete', RATE_LIMITS.bulkOperations);
      const secondsUntilReset = Math.ceil(timeUntilReset / 1000);
      throw new Error(
        `Rate limit exceeded. Please wait ${secondsUntilReset} seconds before trying again.`
      );
    }

    // Validate input
    try {
      const validated = BulkDeleteSchema.parse({
        productIds,
        soft: options?.soft,
      });

      return catalogApi['post']('/admin/catalog/bulk/delete', validated) as Promise<ApiResponse<BulkActionResult>>;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issues = error.issues.map(i => i.message).join(', ');
        throw new Error(`Validation failed: ${issues}`);
      }
      throw error;
    }
  },

  async bulkUpdateStatus(productIds: string[], status: string): Promise<ApiResponse<BulkActionResult>> {
    // Rate limit check
    if (!rateLimiter.canProceed('bulk-update-status', RATE_LIMITS.bulkOperations)) {
      const timeUntilReset = rateLimiter.getTimeUntilReset('bulk-update-status', RATE_LIMITS.bulkOperations);
      const secondsUntilReset = Math.ceil(timeUntilReset / 1000);
      throw new Error(
        `Rate limit exceeded. Please wait ${secondsUntilReset} seconds before trying again.`
      );
    }

    // Validate input
    try {
      const validated = BulkUpdateStatusSchema.parse({
        productIds,
        status,
      });

      return catalogApi['post']('/admin/catalog/bulk/update-status', validated) as Promise<ApiResponse<BulkActionResult>>;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issues = error.issues.map(i => i.message).join(', ');
        throw new Error(`Validation failed: ${issues}`);
      }
      throw error;
    }
  },

  // ==================== VALIDATION OPERATIONS ====================

  async getValidationSummary(filters?: {
    severity?: string;
    productId?: string;
  }): Promise<ApiResponse<any>> {
    const apiParams: Record<string, unknown> = {};
    if (filters?.severity) apiParams.severity = filters.severity;
    if (filters?.productId) apiParams.productId = filters.productId;

    return catalogApi['get']('/admin/catalog/validation/summary', { params: apiParams }) as Promise<ApiResponse<any>>;
  },

  async getProductValidationIssues(productId: string): Promise<ApiResponse<ProductValidationIssue[]>> {
    return catalogApi.getProductValidation(productId) as Promise<ApiResponse<ProductValidationIssue[]>>;
  },

  async resolveValidationIssue(issueId: string): Promise<ApiResponse<void>> {
    return catalogApi['post'](`/admin/catalog/validation/issues/${issueId}/resolve`) as Promise<ApiResponse<void>>;
  },

  // ==================== ANALYTICS & STATISTICS ====================

  async getProductStats(filters?: {
    startDate?: string;
    endDate?: string;
    categoryId?: string;
  }): Promise<ApiResponse<CatalogStats>> {
    const apiParams: Record<string, unknown> = {};
    if (filters?.startDate) apiParams.startDate = filters.startDate;
    if (filters?.endDate) apiParams.endDate = filters.endDate;
    if (filters?.categoryId) apiParams.categoryId = filters.categoryId;

    return catalogApi['get']('/admin/catalog/stats', { params: apiParams }) as Promise<ApiResponse<CatalogStats>>;
  },

  async getRecentActivity(params?: { limit?: number }): Promise<ApiResponse<any[]>> {
    const apiParams: Record<string, unknown> = {};
    if (params?.limit) apiParams.limit = params.limit;

    return catalogApi['get']('/admin/catalog/activity', { params: apiParams }) as Promise<ApiResponse<any[]>>;
  },

  // ==================== ERROR HANDLING & RETRY ====================

  async retryFailedOperation(operationId: string): Promise<ApiResponse<any>> {
    return catalogApi['post'](`/admin/catalog/operations/${operationId}/retry`) as Promise<ApiResponse<any>>;
  },

  async getProductWithRetry(productId: string): Promise<ApiResponse<Product>> {
    // Retry logic with exponential backoff
    const maxRetries = 2;
    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result: any = await catalogApi.getProduct(productId);

        // Check if result exists and has an error property
        if (result && result.error) {
          const statusCode = result.error.statusCode;
          const errorCode = result.error.code;

          // Don't retry on client errors (4xx) or specific error codes like NOT_FOUND
          if (
            (statusCode && statusCode >= 400 && statusCode < 500) ||
            errorCode === 'NOT_FOUND' ||
            errorCode === 'VALIDATION_FAILED' ||
            errorCode === 'UNAUTHORIZED' ||
            errorCode === 'FORBIDDEN'
          ) {
            return result;
          }

          // Retry on server errors (5xx) or network errors
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
            continue;
          }
        }

        // Return successful result or result with non-retryable error
        return result;
      } catch (error: any) {
        lastError = error;

        // Don't retry on last attempt
        if (attempt === maxRetries) {
          throw error;
        }

        // Wait before retry with exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }

    throw lastError;
  },

  // ==================== EXPORT OPERATIONS ====================

  async exportProducts(options: { format: 'csv' | 'json' }): Promise<ApiResponse<any>> {
    const apiParams: Record<string, unknown> = {
      format: options.format,
    };

    return catalogApi['get']('/admin/catalog/export', { params: apiParams }) as Promise<ApiResponse<any>>;
  },
};
