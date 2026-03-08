/**
 * User Management API Client
 * Handles user, designer, and client management operations
 */

import { BaseApiClient } from '../base-client';
import { ApiClientConfig } from '../types';

export class UserManagementApiClient extends BaseApiClient {
  constructor(config: ApiClientConfig) {
    super(config);
  }

  // ==================== Users ====================

  async getUsers(params?: { role?: string; status?: string; search?: string }) {
    return this.get('/users', { params });
  }

  async getUser(id: string) {
    return this.get(`/users/${id}`);
  }

  async createUser(data: {
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    password?: string;
  }) {
    return this.post('/users', data);
  }

  async updateUser(id: string, data: Record<string, unknown>) {
    return this.patch(`/users/${id}`, data);
  }

  async deleteUser(id: string) {
    return this.delete(`/users/${id}`);
  }

  // ==================== Designers ====================

  async getDesigners(params?: { status?: string; search?: string }) {
    return this.get('/designers', { params });
  }

  async getDesigner(id: string) {
    return this.get(`/designers/${id}`);
  }

  async updateDesignerProfile(id: string, data: Record<string, unknown>) {
    return this.patch(`/designers/${id}/profile`, data);
  }

  // ==================== Clients ====================

  async getClients(params?: { designerId?: string; search?: string; page?: number; limit?: number }) {
    return this.get('/clients', { params });
  }

  async getClient(id: string) {
    return this.get(`/clients/${id}`);
  }

  async createClient(data: {
    email: string;
    firstName: string;
    lastName: string;
    phone?: string;
    address?: Record<string, unknown>;
    designerId?: string;
    metadata?: Record<string, unknown>;
  }) {
    return this.post('/clients', data);
  }

  async updateClient(id: string, data: Record<string, unknown>) {
    return this.patch(`/clients/${id}`, data);
  }

  async deleteClient(id: string) {
    return this.delete(`/clients/${id}`);
  }

  async getClientProjects(id: string) {
    return this.get(`/clients/${id}/projects`);
  }

  async getClientOrders(id: string) {
    return this.get(`/clients/${id}/orders`);
  }
}
