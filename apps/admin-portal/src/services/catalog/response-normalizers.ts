/**
 * Response Normalization Utilities
 *
 * Handles various API response formats and transforms them into consistent structures.
 * Provides defensive programming to handle multiple potential API response formats.
 *
 * @module response-normalizers
 */

import type { Product, Category, PaginatedResponse } from '@patina/types';
import type { ProductValidationIssue } from '@/types/admin-catalog';

/**
 * Normalize products response from various possible formats
 * Handles: array, { data: [] }, { products: [] }, { results: [] }, { data: { data: [], meta: {} } }
 */
export function normalizeProductsResponse(
  raw: any,
  fallbackPage: number = 1,
  fallbackPageSize: number = 20
): PaginatedResponse<Product> {
  // Handle null/undefined
  if (!raw) {
    return createEmptyProductsResponse(fallbackPage, fallbackPageSize);
  }

  // Format 1: Direct array
  if (Array.isArray(raw)) {
    return {
      data: raw as Product[],
      meta: {
        total: raw.length,
        page: fallbackPage,
        limit: raw.length,
        totalPages: 1,
      },
    };
  }

  // Format 2: { data: { data: [], meta: {} } }
  if (raw.data?.data && raw.data?.meta) {
    return {
      data: raw.data.data as Product[],
      meta: {
        total: raw.data.meta.total ?? 0,
        page: raw.data.meta.page ?? fallbackPage,
        limit: raw.data.meta.limit ?? raw.data.meta.pageSize ?? fallbackPageSize,
        totalPages: raw.data.meta.totalPages ?? 0,
      },
    };
  }

  // Format 3: { data: [], meta: {} }
  if (raw.data && Array.isArray(raw.data)) {
    const total = raw.meta?.total ?? raw.total ?? raw.data.length;
    const limit = raw.meta?.limit ?? raw.meta?.pageSize ?? raw.pageSize ?? fallbackPageSize;
    return {
      data: raw.data as Product[],
      meta: {
        total,
        page: raw.meta?.page ?? raw.page ?? fallbackPage,
        limit,
        totalPages: raw.meta?.totalPages ?? raw.totalPages ?? Math.ceil(total / limit),
      },
    };
  }

  // Format 4: { products: [], total: 0, page: 1 }
  if (raw.products && Array.isArray(raw.products)) {
    const total = raw.total ?? raw.products.length;
    const limit = raw.pageSize ?? fallbackPageSize;
    return {
      data: raw.products as Product[],
      meta: {
        total,
        page: raw.page ?? fallbackPage,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Format 5: { results: [] }
  if (raw.results && Array.isArray(raw.results)) {
    const total = raw.total ?? raw.results.length;
    const limit = raw.pageSize ?? fallbackPageSize;
    return {
      data: raw.results as Product[],
      meta: {
        total,
        page: raw.page ?? fallbackPage,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Fallback: empty response
  return createEmptyProductsResponse(fallbackPage, fallbackPageSize);
}

/**
 * Normalize single product response
 */
export function normalizeSingleProductResponse(raw: any): Product {
  if (!raw) {
    throw new Error('Product not found');
  }

  // Format 1: { data: product }
  if (raw.data && !Array.isArray(raw.data) && typeof raw.data === 'object') {
    return raw.data as Product;
  }

  // Format 2: direct product object (has id property)
  if (raw.id) {
    return raw as Product;
  }

  throw new Error('Invalid product response format');
}

/**
 * Normalize categories response
 */
export function normalizeCategoriesResponse(raw: any): Category[] {
  if (!raw) return [];

  // Direct array
  if (Array.isArray(raw)) {
    return raw as Category[];
  }

  // { data: [] }
  if (raw.data && Array.isArray(raw.data)) {
    return raw.data as Category[];
  }

  // { categories: [] }
  if (raw.categories && Array.isArray(raw.categories)) {
    return raw.categories as Category[];
  }

  // { results: [] }
  if (raw.results && Array.isArray(raw.results)) {
    return raw.results as Category[];
  }

  return [];
}

/**
 * Normalize validation issues response
 */
export function normalizeProductValidationIssuesResponse(raw: any): ProductValidationIssue[] {
  if (!raw) return [];

  if (Array.isArray(raw)) {
    return raw as ProductValidationIssue[];
  }

  if (raw.data && Array.isArray(raw.data)) {
    return raw.data as ProductValidationIssue[];
  }

  if (raw.issues && Array.isArray(raw.issues)) {
    return raw.issues as ProductValidationIssue[];
  }

  if (raw.results && Array.isArray(raw.results)) {
    return raw.results as ProductValidationIssue[];
  }

  return [];
}

/**
 * Create empty products response
 */
function createEmptyProductsResponse(
  page: number,
  limit: number
): PaginatedResponse<Product> {
  return {
    data: [],
    meta: {
      total: 0,
      page,
      limit,
      totalPages: 0,
    },
  };
}
