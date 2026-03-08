/**
 * Style Profile API Client
 * Handles user style preferences, quizzes, and signals
 */

import { BaseApiClient } from '../base-client';
import { ApiClientConfig } from '../types';

export class StyleProfileApiClient extends BaseApiClient {
  constructor(config: ApiClientConfig) {
    super(config);
  }

  async getProfile(id: string) {
    return this.get(`/v1/style-profiles/${id}`);
  }

  async updateProfile(id: string, data: Record<string, unknown>) {
    return this.patch(`/v1/style-profiles/${id}`, data);
  }

  async completeQuiz(id: string, answers: Record<string, unknown>) {
    return this.post(`/v1/style-profiles/${id}/complete-quiz`, answers);
  }

  async addSignals(id: string, signals: unknown[]) {
    return this.post(`/v1/style-profiles/${id}/signals`, { items: signals });
  }

  async getVersions(id: string) {
    return this.get(`/v1/style-profiles/${id}/versions`);
  }

  async restoreVersion(id: string, version: number) {
    return this.post(`/v1/style-profiles/${id}/restore/${version}`);
  }
}
