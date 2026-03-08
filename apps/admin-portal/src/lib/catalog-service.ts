import { apiClient } from './api-client';
import type { Product, Collection, Category } from '@patina/types';

const api = apiClient as any;

class CatalogService {
  // Products
  async getProducts(params?: Record<string, unknown>) {
    return api.get('/products', { ...params });
  }

  async getProduct(id: string) {
    return api.get(`/products/${id}`);
  }

  async createProduct(data: Partial<Product>) {
    return api.post('/products', data);
  }

  async updateProduct(id: string, data: Partial<Product>) {
    return api.patch(`/products/${id}`, data);
  }

  async deleteProduct(id: string) {
    return api.delete(`/products/${id}`);
  }

  async publishProduct(id: string) {
    return api.post(`/products/${id}/publish`);
  }

  async unpublishProduct(id: string) {
    return api.post(`/products/${id}/unpublish`);
  }

  // Collections
  async getCollections(params?: Record<string, unknown>) {
    return api.get('/collections', { ...params });
  }

  async getCollection(id: string) {
    return api.get(`/collections/${id}`);
  }

  async createCollection(data: Partial<Collection>) {
    return api.post('/collections', data);
  }

  async updateCollection(id: string, data: Partial<Collection>) {
    return api.patch(`/collections/${id}`, data);
  }

  async deleteCollection(id: string) {
    return api.delete(`/collections/${id}`);
  }

  async publishCollection(id: string) {
    return api.post(`/collections/${id}/publish`);
  }

  async scheduleCollection(id: string, publishDate: Date) {
    return api.post(`/collections/${id}/schedule`, { publishDate });
  }

  async evaluateRuleCollection(id: string) {
    return api.post(`/collections/${id}/evaluate`);
  }

  async addProductToCollection(collectionId: string, productId: string) {
    return api.post(`/collections/${collectionId}/products`, { productId });
  }

  async removeProductFromCollection(collectionId: string, productId: string) {
    return api.delete(`/collections/${collectionId}/products/${productId}`);
  }

  async reorderCollectionProducts(collectionId: string, productIds: string[]) {
    return api.put(`/collections/${collectionId}/products/reorder`, { productIds });
  }

  // Categories
  async getCategories(params?: { parentId?: string }) {
    return api.get('/categories', { ...params });
  }

  async getCategory(id: string) {
    return api.get(`/categories/${id}`);
  }

  async getCategoryTree() {
    return api.get('/categories/tree');
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
    return api.post('/categories', data);
  }

  async updateCategory(id: string, data: Partial<Category>) {
    return api.patch(`/categories/${id}`, data);
  }

  async deleteCategory(
    id: string,
    options?: {
      reassignTo?: string;
      deleteChildren?: boolean;
    }
  ) {
    const queryParams = options ? `?${new URLSearchParams(options as any).toString()}` : '';
    return api.delete(`/categories/${id}${queryParams}`);
  }

  async moveCategory(id: string, newParentId: string | null) {
    return api.patch(`/categories/${id}/move`, { newParentId });
  }
}

export const catalogService = new CatalogService();
