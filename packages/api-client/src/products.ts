import { ApiClient } from './client';
import { Product, PaginatedResponse, PaginationParams } from '@patina/types';

export class ProductsApi {
  constructor(private client: ApiClient) {}

  async getProducts(params?: PaginationParams): Promise<PaginatedResponse<Product>> {
    return this.client.get<PaginatedResponse<Product>>('/products', { params });
  }

  async getProductById(id: string): Promise<Product> {
    return this.client.get<Product>(`/products/${id}`);
  }

  async createProduct(data: Partial<Product>): Promise<Product> {
    return this.client.post<Product>('/products', data);
  }

  async updateProduct(id: string, data: Partial<Product>): Promise<Product> {
    return this.client.patch<Product>(`/products/${id}`, data);
  }

  async deleteProduct(id: string): Promise<void> {
    return this.client.delete<void>(`/products/${id}`);
  }
}
