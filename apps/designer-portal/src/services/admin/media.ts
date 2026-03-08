import type { MediaAsset, PaginatedResponse, ApiResponse } from '@/types';

export interface UploadIntent {
  fileName: string;
  mimeType: string;
  kind: 'IMAGE' | 'VIDEO' | 'MODEL3D';
  productId?: string;
  variantId?: string;
  role?: 'HERO' | 'DETAIL' | 'LIFESTYLE' | 'SWATCH' | 'OTHER';
}

export interface UploadResponse {
  assetId: string;
  uploadSessionId: string;
  parUrl?: string; // Pre-Authenticated Request URL for direct upload
  uploadUrl?: string; // Alternative upload URL
  targetKey?: string;
  headers?: Record<string, string>;
  expiresAt: string;
}

export interface ReorderAssetsPayload {
  assetIds: string[]; // Array of asset IDs in the new order
}

export const mediaService = {
  async getAssets(params?: {
    productId?: string;
    kind?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }): Promise<ApiResponse<PaginatedResponse<MediaAsset>>> {
    const searchParams = new URLSearchParams();
    if (params?.productId) searchParams.append('productId', params.productId);
    if (params?.kind) searchParams.append('kind', params.kind);
    if (params?.status) searchParams.append('status', params.status);
    if (params?.page) searchParams.append('page', params.page.toString());
    if (params?.pageSize) searchParams.append('pageSize', params.pageSize.toString());

    const response = await fetch(`/api/admin/media/assets?${searchParams.toString()}`);
    return response.json();
  },

  async getAsset(assetId: string): Promise<ApiResponse<MediaAsset>> {
    const response = await fetch(`/api/admin/media/assets/${assetId}`);
    return response.json();
  },

  async updateAsset(assetId: string, data: Partial<MediaAsset>): Promise<ApiResponse<MediaAsset>> {
    const response = await fetch(`/api/admin/media/assets/${assetId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return response.json();
  },

  async reprocessAsset(assetId: string): Promise<ApiResponse<void>> {
    const response = await fetch(`/api/admin/media/assets/${assetId}/reprocess`, {
      method: 'POST',
    });
    return response.json();
  },

  async blockAsset(assetId: string, reason: string): Promise<ApiResponse<void>> {
    const response = await fetch(`/api/admin/media/assets/${assetId}/block`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    return response.json();
  },

  async getQCIssues(params?: {
    severity?: string;
    status?: string;
  }): Promise<ApiResponse<any[]>> {
    const searchParams = new URLSearchParams();
    if (params?.severity) searchParams.append('severity', params.severity);
    if (params?.status) searchParams.append('status', params.status);

    const response = await fetch(`/api/admin/media/qc/issues?${searchParams.toString()}`);
    return response.json();
  },

  async getProcessingJobs(params?: {
    state?: string;
  }): Promise<ApiResponse<any[]>> {
    const searchParams = new URLSearchParams();
    if (params?.state) searchParams.append('state', params.state);

    const response = await fetch(`/api/admin/media/jobs?${searchParams.toString()}`);
    return response.json();
  },

  /**
   * Create an upload intent and get Pre-Authenticated Request URL
   */
  async createUploadIntent(
    intent: UploadIntent,
    idempotencyKey?: string
  ): Promise<ApiResponse<UploadResponse>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (idempotencyKey) {
      headers['idempotency-key'] = idempotencyKey;
    }

    const response = await fetch('/api/admin/media/upload', {
      method: 'POST',
      headers,
      body: JSON.stringify(intent),
    });
    return response.json();
  },

  /**
   * Upload file directly (multipart/form-data)
   * This is an alternative to PAR URL upload
   */
  async uploadFile(
    file: File,
    intent: UploadIntent,
    onProgress?: (progress: number) => void
  ): Promise<ApiResponse<UploadResponse>> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('fileName', intent.fileName);
    formData.append('mimeType', intent.mimeType);
    formData.append('kind', intent.kind);

    if (intent.productId) formData.append('productId', intent.productId);
    if (intent.variantId) formData.append('variantId', intent.variantId);
    if (intent.role) formData.append('role', intent.role);

    // Note: Progress tracking would require XMLHttpRequest or a fetch wrapper
    const response = await fetch('/api/admin/media/upload', {
      method: 'POST',
      body: formData,
    });
    return response.json();
  },

  /**
   * Upload to PAR URL (for OCI Object Storage)
   */
  async uploadToPAR(
    parUrl: string,
    file: File,
    headers?: Record<string, string>,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    const xhr = new XMLHttpRequest();

    return new Promise((resolve, reject) => {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) {
          const percentComplete = (e.loaded / e.total) * 100;
          onProgress(Math.round(percentComplete));
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Upload failed'));
      });

      xhr.addEventListener('abort', () => {
        reject(new Error('Upload aborted'));
      });

      xhr.open('PUT', parUrl);

      // Set headers
      if (headers) {
        Object.entries(headers).forEach(([key, value]) => {
          xhr.setRequestHeader(key, value);
        });
      }

      xhr.send(file);
    });
  },

  /**
   * Confirm upload completion
   */
  async confirmUpload(sessionId: string): Promise<ApiResponse<void>> {
    const response = await fetch(`/api/admin/media/upload/${sessionId}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
    return response.json();
  },

  /**
   * Delete a media asset
   */
  async deleteAsset(assetId: string, hardDelete = false): Promise<ApiResponse<void>> {
    const response = await fetch(`/api/admin/media/assets/${assetId}?hardDelete=${hardDelete}`, {
      method: 'DELETE',
    });
    return response.json();
  },

  /**
   * Bulk delete assets
   */
  async bulkDeleteAssets(
    assetIds: string[],
    softDelete = true
  ): Promise<ApiResponse<{ success: number; failed: number; errors?: any[] }>> {
    const response = await fetch('/api/admin/media/assets/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assetIds,
        softDelete,
      }),
    });
    return response.json();
  },

  /**
   * Reorder product assets
   */
  async reorderAssets(
    productId: string,
    payload: ReorderAssetsPayload
  ): Promise<ApiResponse<void>> {
    const response = await fetch(`/api/admin/media/assets/${productId}/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return response.json();
  },

  /**
   * Get assets for a product
   */
  async getProductAssets(productId: string): Promise<ApiResponse<MediaAsset[]>> {
    const response = await this.getAssets({ productId, kind: 'IMAGE' });
    return {
      ...response,
      data: (response.data as any)?.items || (Array.isArray(response.data?.data) ? response.data.data : []) || [],
    };
  },
};
