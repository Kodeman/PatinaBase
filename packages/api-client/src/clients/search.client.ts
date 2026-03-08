/**
 * Search API Client
 * Handles product search, autocomplete, and similarity search with request cancellation
 */

import { BaseApiClient } from '../base-client';
import { ApiClientConfig } from '../types';

export class SearchApiClient extends BaseApiClient {
  private abortControllers: Map<string, AbortController> = new Map();

  constructor(config: ApiClientConfig) {
    super(config);
  }

  async search(params: {
    q?: string;
    filters?: string;
    cursor?: string;
    limit?: number;
    sort?: string;
  }) {
    // Cancel previous search request
    const key = 'search';
    this.abortControllers.get(key)?.abort();
    const controller = new AbortController();
    this.abortControllers.set(key, controller);

    try {
      return await this.get('/search', { params, signal: controller.signal });
    } finally {
      this.abortControllers.delete(key);
    }
  }

  async autocomplete(q: string, limit = 10) {
    // Cancel previous autocomplete request
    const key = 'autocomplete';
    this.abortControllers.get(key)?.abort();
    const controller = new AbortController();
    this.abortControllers.set(key, controller);

    try {
      return await this.get('/search/autocomplete', {
        params: { q, limit },
        signal: controller.signal,
      });
    } finally {
      this.abortControllers.delete(key);
    }
  }

  async similarProducts(productId: string, limit = 20) {
    return this.get('/search/similar', { params: { productId, limit } });
  }

  async getFacets(filters?: string) {
    return this.get('/search/facets', { params: { filters } });
  }

  /**
   * Cancel ongoing search request
   */
  cancelSearch() {
    this.abortControllers.get('search')?.abort();
    this.abortControllers.delete('search');
  }

  /**
   * Cancel ongoing autocomplete request
   */
  cancelAutocomplete() {
    this.abortControllers.get('autocomplete')?.abort();
    this.abortControllers.delete('autocomplete');
  }
}
