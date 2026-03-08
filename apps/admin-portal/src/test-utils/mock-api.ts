/**
 * Mock API Responses for Catalog Service
 *
 * Provides mock data and response generators for catalog API endpoints
 */

import type { Product, Variant, Category, PaginatedResponse } from '@patina/types';

/**
 * Generate a mock product with default values
 */
export function createMockProduct(overrides?: Partial<Product>): Product {
  const baseProduct: Product = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    slug: 'modern-sofa',
    name: 'Modern Sofa',
    brand: 'Test Brand',
    shortDescription: 'A comfortable modern sofa',
    longDescription: 'A very comfortable modern sofa with premium materials',
    category: 'sofa',
    manufacturerId: '550e8400-e29b-41d4-a716-446655440001',
    price: 1299.99,
    currency: 'USD',
    materials: ['Fabric', 'Wood'],
    colors: ['Gray', 'Navy'],
    styleTags: ['modern', 'minimalist'],
    status: 'draft',
    has3D: false,
    arSupported: false,
    customizable: true,
    images: [],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  return { ...baseProduct, ...overrides };
}

/**
 * Generate multiple mock products
 */
export function createMockProducts(count: number): Product[] {
  return Array.from({ length: count }, (_, i) =>
    createMockProduct({
      id: `product-${i}`,
      slug: `product-${i}`,
      name: `Product ${i}`,
      status: i % 3 === 0 ? 'published' : 'draft',
    })
  );
}

/**
 * Generate a mock variant
 */
export function createMockVariant(overrides?: Partial<Variant>): Variant {
  const baseVariant: Variant = {
    id: '550e8400-e29b-41d4-a716-446655440100',
    productId: '550e8400-e29b-41d4-a716-446655440000',
    sku: 'SOFA-GRAY-001',
    name: 'Gray Variant',
    colors: ['Gray'],
    price: 1299.99,
    stock: 10,
    available: true,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  } as any;

  return { ...baseVariant, ...overrides };
}

/**
 * Generate a mock category
 */
export function createMockCategory(overrides?: Partial<Category>): Category {
  const baseCategory: any = {
    id: '550e8400-e29b-41d4-a716-446655440200',
    slug: 'seating',
    name: 'Seating',
    description: 'Chairs, sofas, and other seating furniture',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  return { ...baseCategory, ...overrides };
}

/**
 * Generate a mock paginated response
 */
export function createMockPaginatedResponse<T>(
  items: T[],
  overrides?: Partial<PaginatedResponse<T>>
): PaginatedResponse<T> {
  return {
    data: items,
    meta: {
      total: items.length,
      page: 1,
      limit: 20,
      totalPages: Math.ceil(items.length / 20),
      ...overrides?.meta,
    },
    ...overrides,
  };
}

/**
 * Mock validation issues
 */
export interface ValidationIssue {
  id: string;
  productId: string;
  field: string;
  severity: 'error' | 'warning';
  message: string;
  status: 'open' | 'resolved';
}

export function createMockValidationIssue(overrides?: Partial<ValidationIssue>): ValidationIssue {
  return {
    id: 'issue-1',
    productId: 'product-1',
    field: 'price',
    severity: 'error',
    message: 'Price must be greater than zero',
    status: 'open',
    ...overrides,
  };
}

/**
 * Mock catalog statistics
 */
export interface CatalogStats {
  totalProducts: number;
  publishedProducts: number;
  draftProducts: number;
  totalVariants: number;
  totalCategories: number;
  validationIssues: number;
  recentlyUpdated: number;
}

export function createMockCatalogStats(overrides?: Partial<CatalogStats>): CatalogStats {
  return {
    totalProducts: 150,
    publishedProducts: 120,
    draftProducts: 30,
    totalVariants: 450,
    totalCategories: 25,
    validationIssues: 5,
    recentlyUpdated: 10,
    ...overrides,
  };
}

/**
 * Mock import job
 */
export interface ImportJob {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  source: string;
  totalRecords: number;
  processedRecords: number;
  errors: number;
  createdAt: Date;
}

export function createMockImportJob(overrides?: Partial<ImportJob>): ImportJob {
  return {
    id: 'job-1',
    status: 'pending',
    source: 'csv_import',
    totalRecords: 100,
    processedRecords: 0,
    errors: 0,
    createdAt: new Date(),
    ...overrides,
  };
}

/**
 * Mock API error response
 */
export interface ApiError {
  code: string;
  message: string;
  details?: any;
}

export function createMockApiError(overrides?: Partial<ApiError>): ApiError {
  return {
    code: 'INTERNAL_ERROR',
    message: 'An error occurred',
    ...overrides,
  };
}

/**
 * Mock bulk operation response
 */
export interface BulkOperationResult {
  successful: string[];
  failed: Array<{ id: string; error: string }>;
  total: number;
}

export function createMockBulkOperationResult(
  overrides?: Partial<BulkOperationResult>
): BulkOperationResult {
  return {
    successful: ['product-1', 'product-2'],
    failed: [],
    total: 2,
    ...overrides,
  };
}
