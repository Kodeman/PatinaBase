import { apiClient } from '@/lib/api-client';
const api = apiClient as any;
import type { SynonymSet, ApiResponse } from '@/types';

export const searchService = {
  // Synonyms
  async getSynonyms(): Promise<ApiResponse<SynonymSet[]>> {
    return api.get('/v1/admin/search/synonyms');
  },

  async createSynonym(data: Partial<SynonymSet>): Promise<ApiResponse<SynonymSet>> {
    return api.post('/v1/admin/search/synonyms', data);
  },

  async updateSynonym(id: string, data: Partial<SynonymSet>): Promise<ApiResponse<SynonymSet>> {
    return api.patch(`/v1/admin/search/synonyms/${id}`, data);
  },

  async deleteSynonym(id: string): Promise<ApiResponse<void>> {
    return api.delete(`/v1/admin/search/synonyms/${id}`);
  },

  // Boosts
  async getBoosts(): Promise<ApiResponse<any[]>> {
    return api.get('/v1/admin/search/boosts');
  },

  async createBoost(data: any): Promise<ApiResponse<any>> {
    return api.post('/v1/admin/search/boosts', data);
  },

  async updateBoost(id: string, data: any): Promise<ApiResponse<any>> {
    return api.patch(`/v1/admin/search/boosts/${id}`, data);
  },

  async deleteBoost(id: string): Promise<ApiResponse<void>> {
    return api.delete(`/v1/admin/search/boosts/${id}`);
  },

  // Reindex
  async triggerReindex(params?: {
    scope?: string;
    value?: string;
  }): Promise<ApiResponse<any>> {
    return api.post('/v1/admin/search/reindex', params);
  },

  async getReindexStatus(): Promise<ApiResponse<any>> {
    return api.get('/v1/admin/search/reindex/status');
  },

  async swapAlias(data: {
    fromIndex: string;
    toIndex: string;
  }): Promise<ApiResponse<void>> {
    return api.post('/v1/admin/search/alias-swap', data);
  },

  // Query Console
  async testQuery(params: {
    q: string;
    filters?: any;
    staged?: boolean;
  }): Promise<ApiResponse<any>> {
    const searchParams = new URLSearchParams();
    searchParams.append('q', params.q);
    if (params.filters) searchParams.append('filters', JSON.stringify(params.filters));
    if (params.staged) searchParams.append('staged', 'true');

    return api.get(`/v1/admin/search/query-console?${searchParams.toString()}`);
  },
};
