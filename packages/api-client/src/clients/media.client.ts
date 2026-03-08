/**
 * Media API Client
 * Handles media assets, photos, and file uploads
 */

import { BaseApiClient } from '../base-client';
import { ApiClientConfig } from '../types';

export class MediaApiClient extends BaseApiClient {
  constructor(config: ApiClientConfig) {
    super(config);
  }

  // ==================== Photos ====================

  async getPhotos(projectId: string) {
    return this.get(`/projects/${projectId}/photos`);
  }

  async getPhoto(photoId: string) {
    return this.get(`/photos/${photoId}`);
  }

  async uploadPhoto(projectId: string, file: File, metadata?: unknown) {
    const formData = new FormData();
    formData.append('file', file);
    if (metadata) {
      formData.append('metadata', JSON.stringify(metadata));
    }

    return this.post(`/projects/${projectId}/photos`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  }
}
