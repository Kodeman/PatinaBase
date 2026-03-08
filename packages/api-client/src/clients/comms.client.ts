/**
 * Communications API Client
 * Handles threads, messages, and communication operations
 */

import { BaseApiClient } from '../base-client';
import { ApiClientConfig } from '../types';

export class CommsApiClient extends BaseApiClient {
  constructor(config: ApiClientConfig) {
    super(config);
  }

  // ==================== Threads ====================

  async getThreads(params?: { scope?: string; cursor?: string; limit?: number }) {
    return this.get('/v1/threads', { params });
  }

  async getThread(id: string) {
    return this.get(`/v1/threads/${id}`);
  }

  // ==================== Messages ====================

  async createMessage(
    threadId: string,
    data: { bodyText?: string; bodyMd?: string; attachments?: unknown[] }
  ) {
    return this.post(`/v1/threads/${threadId}/messages`, data);
  }

  async markRead(threadId: string, lastReadMessageId: string) {
    return this.post(`/v1/threads/${threadId}/read`, { lastReadMessageId });
  }

  // ==================== Comments ====================

  async getComments(contextType: string, contextId: string) {
    return this.get('/comments', {
      params: { contextType, contextId },
    });
  }

  async addComment(contextType: string, contextId: string, content: string) {
    return this.post('/comments', {
      contextType,
      contextId,
      content,
    });
  }
}
