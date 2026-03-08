import { ApiClient } from './client';
import { User, PaginatedResponse, PaginationParams } from '@patina/types';

export class UsersApi {
  constructor(private client: ApiClient) {}

  async getUsers(params?: PaginationParams): Promise<PaginatedResponse<User>> {
    return this.client.get<PaginatedResponse<User>>('/users', { params });
  }

  async getUserById(id: string): Promise<User> {
    return this.client.get<User>(`/users/${id}`);
  }

  async updateUser(id: string, data: Partial<User>): Promise<User> {
    return this.client.patch<User>(`/users/${id}`, data);
  }

  async deleteUser(id: string): Promise<void> {
    return this.client.delete<void>(`/users/${id}`);
  }
}
