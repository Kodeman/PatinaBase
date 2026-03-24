/**
 * Catalog Service
 *
 * Thin wrapper for admin catalog write operations that call API routes.
 * Read operations now go directly through Supabase in the hooks.
 */

import { createBrowserClient } from '@patina/supabase';

async function getAuthToken(): Promise<string | null> {
  const supabase = createBrowserClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

async function adminFetch(url: string, options: RequestInit = {}) {
  const token = await getAuthToken();
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

function mapCategoryRow(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    name: (row.name as string) || '',
    slug: (row.slug as string) || '',
    description: (row.description as string) || '',
    path: (row.slug as string) || '',
    depth: 0,
    order: (row.sort_order as number) ?? 0,
    isActive: (row.is_active as boolean) ?? true,
    productCount: (row.product_count as number) ?? 0,
    parentId: (row.parent_id as string) || undefined,
    imageUrl: (row.image_url as string) || undefined,
    createdAt: row.created_at ? new Date(row.created_at as string) : new Date(),
    updatedAt: row.updated_at ? new Date(row.updated_at as string) : new Date(),
  };
}

export const catalogService = {
  // Products - write operations via API routes
  async getProduct(productId: string) {
    return adminFetch(`/api/catalog/products/${productId}`);
  },

  async createProduct(data: Record<string, unknown> | object) {
    return adminFetch('/api/catalog/products', { method: 'POST', body: JSON.stringify(data) });
  },

  async updateProduct(productId: string, data: Record<string, unknown> | object) {
    return adminFetch(`/api/catalog/products/${productId}`, { method: 'PATCH', body: JSON.stringify(data) });
  },

  async deleteProduct(productId: string) {
    return adminFetch(`/api/catalog/products/${productId}`, { method: 'DELETE' });
  },

  async publishProduct(productId: string) {
    return adminFetch(`/api/catalog/products/${productId}/publish`, { method: 'POST' });
  },

  async unpublishProduct(productId: string) {
    return adminFetch(`/api/catalog/products/${productId}/unpublish`, { method: 'POST' });
  },

  // Bulk operations
  async bulkPublish(productIds: string[]) {
    return adminFetch('/api/catalog/products/bulk', {
      method: 'POST',
      body: JSON.stringify({ action: 'publish', productIds }),
    });
  },

  async bulkUnpublish(productIds: string[]) {
    return adminFetch('/api/catalog/products/bulk', {
      method: 'POST',
      body: JSON.stringify({ action: 'unpublish', productIds }),
    });
  },

  async bulkDelete(productIds: string[]) {
    return adminFetch('/api/catalog/products/bulk', {
      method: 'POST',
      body: JSON.stringify({ action: 'delete', productIds }),
    });
  },

  // Categories - read from Supabase directly
  async getCategories() {
    const supabase = createBrowserClient();
    const { data, error } = await supabase.from('categories').select('*').order('name');
    if (error) throw error;
    const categories = (data ?? []).map(mapCategoryRow);
    return { data: categories };
  },

  async getCategory(categoryId: string) {
    const supabase = createBrowserClient();
    const { data, error } = await supabase.from('categories').select('*').eq('id', categoryId).single();
    if (error) throw error;
    return { data: data ? mapCategoryRow(data) : null };
  },

  async createCategory(data: Record<string, unknown>) {
    return adminFetch('/api/catalog/categories', { method: 'POST', body: JSON.stringify(data) });
  },

  async updateCategory(categoryId: string, data: Record<string, unknown>) {
    return adminFetch(`/api/catalog/categories/${categoryId}`, { method: 'PATCH', body: JSON.stringify(data) });
  },

  async deleteCategory(categoryId: string) {
    return adminFetch(`/api/catalog/categories/${categoryId}`, { method: 'DELETE' });
  },

  // Variants — write operations via API routes
  async createVariant(productId: string, data: Partial<Record<string, unknown>>) {
    return adminFetch(`/api/catalog/products/${productId}/variants`, { method: 'POST', body: JSON.stringify(data) });
  },

  async updateVariant(variantId: string, data: Partial<Record<string, unknown>>) {
    return adminFetch(`/api/catalog/variants/${variantId}`, { method: 'PATCH', body: JSON.stringify(data) });
  },

  async deleteVariant(variantId: string) {
    return adminFetch(`/api/catalog/variants/${variantId}`, { method: 'DELETE' });
  },
};
