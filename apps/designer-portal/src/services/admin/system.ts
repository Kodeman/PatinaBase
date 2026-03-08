import type { HealthMetrics, AuditLog, PrivacyJob, FeatureFlag, PaginatedResponse, ApiResponse } from '@/types';

export const systemService = {
  // Health
  async getHealth(): Promise<ApiResponse<HealthMetrics>> {
    const response = await fetch('/api/admin/health/overview');
    return response.json();
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

    const response = await fetch(`/api/admin/audit?${searchParams.toString()}`);
    return response.json();
  },

  async exportAuditLogs(params: {
    from: string;
    to: string;
  }): Promise<ApiResponse<{ exportUrl: string }>> {
    const response = await fetch('/api/admin/audit/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return response.json();
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

    const response = await fetch(`/api/admin/privacy/jobs?${searchParams.toString()}`);
    return response.json();
  },

  async createPrivacyJob(data: {
    userId: string;
    type: 'export' | 'delete';
    reason?: string;
  }): Promise<ApiResponse<PrivacyJob>> {
    const response = await fetch('/api/admin/privacy/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return response.json();
  },

  async approvePrivacyJob(jobId: string): Promise<ApiResponse<void>> {
    const response = await fetch(`/api/admin/privacy/jobs/${jobId}/approve`, {
      method: 'POST',
    });
    return response.json();
  },

  async holdPrivacyJob(jobId: string, reason: string): Promise<ApiResponse<void>> {
    const response = await fetch(`/api/admin/privacy/jobs/${jobId}/hold`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    return response.json();
  },

  async runPrivacyJob(jobId: string): Promise<ApiResponse<void>> {
    const response = await fetch(`/api/admin/privacy/jobs/${jobId}/run`, {
      method: 'POST',
    });
    return response.json();
  },

  // Feature Flags
  async getFlags(): Promise<ApiResponse<FeatureFlag[]>> {
    const response = await fetch('/api/admin/flags');
    return response.json();
  },

  async getFlag(key: string): Promise<ApiResponse<FeatureFlag>> {
    const response = await fetch(`/api/admin/flags/${key}`);
    return response.json();
  },

  async createFlag(data: Partial<FeatureFlag>): Promise<ApiResponse<FeatureFlag>> {
    const response = await fetch('/api/admin/flags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return response.json();
  },

  async updateFlag(key: string, data: Partial<FeatureFlag>): Promise<ApiResponse<FeatureFlag>> {
    const response = await fetch(`/api/admin/flags/${key}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return response.json();
  },

  async deleteFlag(key: string): Promise<ApiResponse<void>> {
    const response = await fetch(`/api/admin/flags/${key}`, {
      method: 'DELETE',
    });
    return response.json();
  },
};
