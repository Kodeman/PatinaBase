import { apiClient } from '@/lib/api-client';
const api = apiClient as any;
import type { HealthMetrics, AuditLog, PrivacyJob, FeatureFlag, PaginatedResponse, ApiResponse } from '@/types';

export const systemService = {
  // Health
  async getHealth(): Promise<ApiResponse<HealthMetrics>> {
    return api.get('/v1/admin/health/overview');
  },

  // Audit Logs
  async getAuditLogs(params?: {
    actorId?: string;
    action?: string;
    resourceType?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  }): Promise<ApiResponse<PaginatedResponse<AuditLog>>> {
    const searchParams = new URLSearchParams();
    if (params?.actorId) searchParams.append('actorId', params.actorId);
    if (params?.action) searchParams.append('action', params.action);
    if (params?.resourceType) searchParams.append('resourceType', params.resourceType);
    if (params?.from) searchParams.append('from', params.from);
    if (params?.to) searchParams.append('to', params.to);
    if (params?.page) searchParams.append('page', params.page.toString());
    if (params?.pageSize) searchParams.append('pageSize', params.pageSize.toString());

    return api.get(`/v1/admin/audit?${searchParams.toString()}`);
  },

  async exportAuditLogs(params: {
    from: string;
    to: string;
  }): Promise<ApiResponse<{ exportUrl: string }>> {
    return api.post('/v1/admin/audit/export', params);
  },

  // Privacy Operations
  async getPrivacyJobs(params?: {
    type?: string;
    state?: string;
    page?: number;
    pageSize?: number;
  }): Promise<ApiResponse<PaginatedResponse<PrivacyJob>>> {
    const searchParams = new URLSearchParams();
    if (params?.type) searchParams.append('type', params.type);
    if (params?.state) searchParams.append('state', params.state);
    if (params?.page) searchParams.append('page', params.page.toString());
    if (params?.pageSize) searchParams.append('pageSize', params.pageSize.toString());

    return api.get(`/v1/admin/privacy/jobs?${searchParams.toString()}`);
  },

  async createPrivacyJob(data: {
    userId: string;
    type: 'export' | 'delete';
    reason?: string;
  }): Promise<ApiResponse<PrivacyJob>> {
    return api.post('/v1/admin/privacy/jobs', data);
  },

  async approvePrivacyJob(jobId: string): Promise<ApiResponse<void>> {
    return api.post(`/v1/admin/privacy/jobs/${jobId}/approve`);
  },

  async holdPrivacyJob(jobId: string, reason: string): Promise<ApiResponse<void>> {
    return api.post(`/v1/admin/privacy/jobs/${jobId}/hold`, { reason });
  },

  async runPrivacyJob(jobId: string): Promise<ApiResponse<void>> {
    return api.post(`/v1/admin/privacy/jobs/${jobId}/run`);
  },

  // Feature Flags
  async getFlags(): Promise<ApiResponse<FeatureFlag[]>> {
    return api.get('/v1/admin/flags');
  },

  async getFlag(key: string): Promise<ApiResponse<FeatureFlag>> {
    return api.get(`/v1/admin/flags/${key}`);
  },

  async createFlag(data: Partial<FeatureFlag>): Promise<ApiResponse<FeatureFlag>> {
    return api.post('/v1/admin/flags', data);
  },

  async updateFlag(key: string, data: Partial<FeatureFlag>): Promise<ApiResponse<FeatureFlag>> {
    return api.patch(`/v1/admin/flags/${key}`, data);
  },

  async deleteFlag(key: string): Promise<ApiResponse<void>> {
    return api.delete(`/v1/admin/flags/${key}`);
  },
};
