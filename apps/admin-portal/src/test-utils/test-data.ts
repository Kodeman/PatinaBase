/**
 * Test Data Generators
 *
 * Provides realistic test data for various scenarios
 */

import {
  createMockProduct,
  createMockProducts,
  createMockCategory,
  createMockValidationIssue,
  createMockCatalogStats,
  type ValidationIssue,
} from './mock-api';

/**
 * Test data scenarios for common use cases
 */
export const testData = {
  /**
   * Products in various states
   */
  products: {
    draft: createMockProduct({ status: 'draft', publishedAt: undefined }),
    inReview: createMockProduct({ status: 'in_review' }),
    published: createMockProduct({
      status: 'published',
      publishedAt: new Date('2024-01-15')
    }),
    deprecated: createMockProduct({ status: 'deprecated' }),
    with3D: createMockProduct({ has3D: true, arSupported: true }),
    withValidationIssues: createMockProduct({
      id: 'product-with-issues',
      price: 0, // Invalid price
    }),
  },

  /**
   * Product lists for pagination testing
   */
  productLists: {
    empty: [],
    small: createMockProducts(5),
    medium: createMockProducts(20),
    large: createMockProducts(100),
  },

  /**
   * Categories
   */
  categories: [
    createMockCategory({ id: 'cat-1', slug: 'seating', name: 'Seating' }),
    createMockCategory({ id: 'cat-2', slug: 'tables', name: 'Tables' }),
    createMockCategory({ id: 'cat-3', slug: 'sofas', name: 'Sofas', parentId: 'cat-1' }),
  ],

  /**
   * Validation issues
   */
  validationIssues: [
    createMockValidationIssue({
      id: 'issue-1',
      productId: 'product-1',
      field: 'price',
      severity: 'error',
      message: 'Price must be greater than zero',
    }),
    createMockValidationIssue({
      id: 'issue-2',
      productId: 'product-2',
      field: 'images',
      severity: 'warning',
      message: 'Product should have at least 3 images',
    }),
  ],

  /**
   * Catalog statistics
   */
  stats: createMockCatalogStats(),
};

/**
 * Generate a sequence of IDs for testing
 */
export function generateIds(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}-${i + 1}`);
}

/**
 * Wait for a specific amount of time (for async testing)
 */
export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a mock file for upload testing
 */
export function createMockFile(
  name: string = 'test.csv',
  content: string = 'name,sku,price\nProduct 1,SKU-1,99.99',
  type: string = 'text/csv'
): File {
  const blob = new Blob([content], { type });
  return new File([blob], name, { type });
}
