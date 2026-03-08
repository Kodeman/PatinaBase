import type { Product, Variant, Category, PaginatedResponse, ApiResponse } from '@/types';
import type { BulkActionResult, CatalogStats, ProductValidationIssue } from '@/types/admin-catalog';

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
    const searchParams = new URLSearchParams();
    if (params?.query) searchParams.append('q', params.query);
    if (params?.status) searchParams.append('status', params.status);
    if (params?.statuses) searchParams.append('statuses', params.statuses.join(','));
    if (params?.category) searchParams.append('category', params.category);
    if (params?.brand) searchParams.append('brand', params.brand);
    if (params?.page) searchParams.append('page', params.page.toString());
    if (params?.pageSize) searchParams.append('pageSize', params.pageSize.toString());
    if (params?.createdAfter) searchParams.append('createdAfter', params.createdAfter);
    if (params?.createdBefore) searchParams.append('createdBefore', params.createdBefore);
    if (params?.hasValidationIssues !== undefined) {
      searchParams.append('hasValidationIssues', params.hasValidationIssues.toString());
    }

    const response = await fetch(`/api/admin/catalog/products?${searchParams.toString()}`);
    return response.json();
  },

  async getProduct(productId: string): Promise<ApiResponse<Product>> {
    const response = await fetch(`/api/admin/catalog/products/${productId}`);
    return response.json();
  },

  async createProduct(data: Partial<Product>): Promise<ApiResponse<Product>> {
    const response = await fetch('/api/admin/catalog/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return response.json();
  },

  async updateProduct(productId: string, data: Partial<Product>): Promise<ApiResponse<Product>> {
    const response = await fetch(`/api/admin/catalog/products/${productId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return response.json();
  },

  async deleteProduct(productId: string): Promise<ApiResponse<void>> {
    const response = await fetch(`/api/admin/catalog/products/${productId}`, {
      method: 'DELETE',
    });
    return response.json();
  },

  async publishProduct(productId: string): Promise<ApiResponse<void>> {
    const response = await fetch(`/api/admin/catalog/products/${productId}/publish`, {
      method: 'POST',
    });
    return response.json();
  },

  async unpublishProduct(productId: string): Promise<ApiResponse<void>> {
    const response = await fetch(`/api/admin/catalog/products/${productId}/unpublish`, {
      method: 'POST',
    });
    return response.json();
  },

  // Variants
  async createVariant(productId: string, data: Partial<Variant>): Promise<ApiResponse<Variant>> {
    const response = await fetch(`/api/admin/catalog/products/${productId}/variants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return response.json();
  },

  async updateVariant(variantId: string, data: Partial<Variant>): Promise<ApiResponse<Variant>> {
    const response = await fetch(`/api/admin/catalog/variants/${variantId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return response.json();
  },

  async deleteVariant(variantId: string): Promise<ApiResponse<void>> {
    const response = await fetch(`/api/admin/catalog/variants/${variantId}`, {
      method: 'DELETE',
    });
    return response.json();
  },

  // Categories
  async getCategories(): Promise<ApiResponse<Category[]>> {
    const response = await fetch('/api/admin/catalog/categories');
    return response.json();
  },

  async getCategory(categoryId: string): Promise<ApiResponse<Category>> {
    const response = await fetch(`/api/admin/catalog/categories/${categoryId}`);
    return response.json();
  },

  async createCategory(data: Partial<Category>): Promise<ApiResponse<Category>> {
    const response = await fetch('/api/admin/catalog/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return response.json();
  },

  async updateCategory(categoryId: string, data: Partial<Category>): Promise<ApiResponse<Category>> {
    const response = await fetch(`/api/admin/catalog/categories/${categoryId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return response.json();
  },

  async deleteCategory(categoryId: string): Promise<ApiResponse<void>> {
    const response = await fetch(`/api/admin/catalog/categories/${categoryId}`, {
      method: 'DELETE',
    });
    return response.json();
  },

  // Validation Issues
  async getValidationIssues(params?: {
    productId?: string;
    severity?: string;
    status?: string;
  }): Promise<ApiResponse<any[]>> {
    const searchParams = new URLSearchParams();
    if (params?.productId) searchParams.append('productId', params.productId);
    if (params?.severity) searchParams.append('severity', params.severity);
    if (params?.status) searchParams.append('status', params.status);

    const response = await fetch(`/api/admin/catalog/issues?${searchParams.toString()}`);
    return response.json();
  },

  // Import
  async createImportJob(data: {
    source: string;
    mapping: any;
    file?: File;
  }): Promise<ApiResponse<any>> {
    const formData = new FormData();
    formData.append('source', data.source);
    formData.append('mapping', JSON.stringify(data.mapping));
    if (data.file) {
      formData.append('file', data.file);
    }

    const response = await fetch('/api/admin/catalog/imports', {
      method: 'POST',
      body: formData,
    });
    return response.json();
  },

  async getImportJob(jobId: string): Promise<ApiResponse<any>> {
    const response = await fetch(`/api/admin/catalog/imports/${jobId}`);
    return response.json();
  },

  async getImportJobs(): Promise<ApiResponse<PaginatedResponse<any>>> {
    const response = await fetch('/api/admin/catalog/imports');
    return response.json();
  },

  async retryImportJob(jobId: string): Promise<ApiResponse<void>> {
    const response = await fetch(`/api/admin/catalog/imports/${jobId}/retry`, {
      method: 'POST',
    });
    return response.json();
  },

  // ==================== BULK OPERATIONS ====================

  async bulkPublish(productIds: string[]): Promise<ApiResponse<BulkActionResult>> {
    const response = await fetch('/api/admin/catalog/bulk/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productIds }),
    });
    return response.json();
  },

  async bulkUnpublish(productIds: string[], reason?: string): Promise<ApiResponse<BulkActionResult>> {
    const payload: { productIds: string[]; reason?: string } = { productIds };
    if (reason) {
      payload.reason = reason;
    }

    const response = await fetch('/api/admin/catalog/bulk/unpublish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return response.json();
  },

  async bulkDelete(productIds: string[], options?: { soft?: boolean }): Promise<ApiResponse<BulkActionResult>> {
    const response = await fetch('/api/admin/catalog/bulk/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productIds,
        soft: options?.soft,
      }),
    });
    return response.json();
  },

  async bulkUpdateStatus(productIds: string[], status: string): Promise<ApiResponse<BulkActionResult>> {
    const response = await fetch('/api/admin/catalog/bulk/update-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productIds,
        status,
      }),
    });
    return response.json();
  },

  // ==================== VALIDATION OPERATIONS ====================

  async getValidationSummary(filters?: {
    severity?: string;
    productId?: string;
  }): Promise<ApiResponse<any>> {
    const searchParams = new URLSearchParams();
    if (filters?.severity) searchParams.append('severity', filters.severity);
    if (filters?.productId) searchParams.append('productId', filters.productId);

    const response = await fetch(`/api/admin/catalog/validation/summary?${searchParams.toString()}`);
    return response.json();
  },

  async getProductValidationIssues(productId: string): Promise<ApiResponse<ProductValidationIssue[]>> {
    const response = await fetch(`/api/admin/catalog/products/${productId}/validation`);
    return response.json();
  },

  async resolveValidationIssue(issueId: string): Promise<ApiResponse<void>> {
    const response = await fetch(`/api/admin/catalog/validation/issues/${issueId}/resolve`, {
      method: 'POST',
    });
    return response.json();
  },

  // ==================== ANALYTICS & STATISTICS ====================

  async getProductStats(filters?: {
    startDate?: string;
    endDate?: string;
    categoryId?: string;
  }): Promise<ApiResponse<CatalogStats>> {
    const searchParams = new URLSearchParams();
    if (filters?.startDate) searchParams.append('startDate', filters.startDate);
    if (filters?.endDate) searchParams.append('endDate', filters.endDate);
    if (filters?.categoryId) searchParams.append('categoryId', filters.categoryId);

    const response = await fetch(`/api/admin/catalog/stats?${searchParams.toString()}`);
    return response.json();
  },

  async getRecentActivity(params?: { limit?: number }): Promise<ApiResponse<any[]>> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.append('limit', params.limit.toString());

    const response = await fetch(`/api/admin/catalog/activity?${searchParams.toString()}`);
    return response.json();
  },

  // ==================== ERROR HANDLING & RETRY ====================

  async retryFailedOperation(operationId: string): Promise<ApiResponse<any>> {
    const response = await fetch(`/api/admin/catalog/operations/${operationId}/retry`, {
      method: 'POST',
    });
    return response.json();
  },

  async getProductWithRetry(productId: string): Promise<ApiResponse<Product>> {
    // Retry logic with exponential backoff
    const maxRetries = 2;
    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.getProduct(productId);

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
    const searchParams = new URLSearchParams();
    searchParams.append('format', options.format);

    const response = await fetch(`/api/admin/catalog/export?${searchParams.toString()}`);
    return response.json();
  },
};
