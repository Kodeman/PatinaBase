/**
 * Catalog API Client
 * Handles product catalog, collections, categories, and vendor operations
 */

import { BaseApiClient } from '../base-client';
import { ApiClientConfig } from '../types';

export class CatalogApiClient extends BaseApiClient {
  constructor(config: ApiClientConfig) {
    super(config);
  }

  // ==================== Products ====================

  async getProducts(params?: Record<string, unknown>) {
    return this.get('/products', { params });
  }

  async getProduct(id: string) {
    return this.get(`/products/${id}`);
  }

  async getProductBySlug(slug: string) {
    return this.get(`/products/slug/${slug}`);
  }

  async searchProducts(query: string, options?: { limit?: number; status?: string }) {
    return this.get(`/products/search/${query}`, { params: options });
  }

  async createProduct(data: Record<string, unknown>) {
    return this.post('/products', data);
  }

  async updateProduct(id: string, data: Record<string, unknown>) {
    return this.patch(`/products/${id}`, data);
  }

  async deleteProduct(id: string) {
    return this.delete(`/products/${id}`);
  }

  async publishProduct(id: string) {
    return this.post(`/products/${id}/publish`);
  }

  async unpublishProduct(id: string) {
    return this.post(`/products/${id}/unpublish`);
  }

  async getProductValidation(id: string) {
    return this.get(`/products/${id}/validation-issues`);
  }

  async resolveValidationIssue(productId: string, issueId: string, resolution: string) {
    return this.post(`/products/${productId}/validation-issues/${issueId}/resolve`, {
      resolution,
    });
  }

  async unresolveValidationIssue(productId: string, issueId: string) {
    return this.delete(`/products/${productId}/validation-issues/${issueId}/resolve`);
  }

  async bulkResolveValidationIssues(productId: string, data: { issueIds: string[]; resolution: string }) {
    return this.post(`/products/${productId}/validation-issues/bulk-resolve`, data);
  }

  async revalidateProduct(productId: string) {
    return this.post(`/products/${productId}/revalidate`);
  }

  // ==================== Collections ====================

  async getCollections(params?: Record<string, unknown>) {
    return this.get('/collections', { params });
  }

  async getCollection(id: string) {
    return this.get(`/collections/${id}`);
  }

  async getCollectionProducts(id: string, params?: Record<string, unknown>) {
    return this.get(`/collections/${id}/products`, { params });
  }

  async createCollection(data: Record<string, unknown>) {
    return this.post('/collections', data);
  }

  async updateCollection(id: string, data: Record<string, unknown>) {
    return this.patch(`/collections/${id}`, data);
  }

  async deleteCollection(id: string) {
    return this.delete(`/collections/${id}`);
  }

  async publishCollection(id: string) {
    return this.post(`/collections/${id}/publish`);
  }

  async scheduleCollection(id: string, publishDate: Date) {
    return this.post(`/collections/${id}/schedule`, { publishDate });
  }

  async evaluateRuleCollection(id: string) {
    return this.post(`/collections/${id}/evaluate`);
  }

  async addProductToCollection(collectionId: string, data: { productId: string }) {
    return this.post(`/collections/${collectionId}/products`, data);
  }

  async removeProductFromCollection(collectionId: string, productId: string) {
    return this.delete(`/collections/${collectionId}/products/${productId}`);
  }

  async reorderCollectionProducts(collectionId: string, data: { productIds: string[] }) {
    return this.put(`/collections/${collectionId}/products/reorder`, data);
  }

  // ==================== Categories ====================

  async getCategories(params?: { parentId?: string }) {
    return this.get('/categories', { params });
  }

  async getCategory(id: string) {
    return this.get(`/categories/${id}`);
  }

  async getCategoryTree() {
    return this.get('/categories/tree');
  }

  async createCategory(data: {
    name: string;
    slug: string;
    parentId?: string;
    description?: string;
    image?: string;
    seoTitle?: string;
    seoDescription?: string;
    order: number;
    isActive: boolean;
  }) {
    return this.post('/categories', data);
  }

  async updateCategory(id: string, data: Record<string, unknown>) {
    return this.patch(`/categories/${id}`, data);
  }

  async deleteCategory(
    id: string,
    options?: {
      reassignTo?: string;
      deleteChildren?: boolean;
    }
  ) {
    return this.delete(`/categories/${id}`, { params: options });
  }

  async moveCategory(id: string, newParentId: string | null) {
    return this.patch(`/categories/${id}/move`, { newParentId });
  }

  // ==================== Variants ====================

  async getVariants(productId: string) {
    return this.get(`/products/${productId}/variants`);
  }

  async getVariant(productId: string, variantId: string) {
    return this.get(`/products/${productId}/variants/${variantId}`);
  }

  async createVariant(productId: string, data: Record<string, unknown>) {
    return this.post(`/products/${productId}/variants`, data);
  }

  async updateVariant(productId: string, variantId: string, data: Record<string, unknown>) {
    return this.patch(`/products/${productId}/variants/${variantId}`, data);
  }

  async deleteVariant(productId: string, variantId: string) {
    return this.delete(`/products/${productId}/variants/${variantId}`);
  }

  async updateVariantInventory(
    productId: string,
    variantId: string,
    data: { quantity?: number; availabilityStatus?: string }
  ) {
    return this.patch(`/products/${productId}/variants/${variantId}/inventory`, data);
  }

  // ==================== Vendors ====================

  async getVendors(params?: Record<string, unknown>) {
    return this.get('/vendors', { params });
  }

  async getVendor(id: string) {
    return this.get(`/vendors/${id}`);
  }

  // ==================== Attributes ====================

  async getAttributes(params?: Record<string, unknown>) {
    return this.get('/attributes', { params });
  }

  async getAttribute(id: string) {
    return this.get(`/attributes/${id}`);
  }
}
