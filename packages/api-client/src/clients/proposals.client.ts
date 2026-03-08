/**
 * Proposals API Client
 * Handles design proposals, sections, items, and sharing
 */

import { BaseApiClient } from '../base-client';
import { ApiClientConfig } from '../types';

export class ProposalsApiClient extends BaseApiClient {
  constructor(config: ApiClientConfig) {
    super(config);
  }

  // ==================== Proposals ====================

  async getProposals(params?: {
    designerId?: string;
    clientId?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    return this.get('/proposals', { params });
  }

  async getProposal(id: string) {
    return this.get(`/proposals/${id}`);
  }

  async createProposal(data: {
    title: string;
    clientId: string;
    designerId: string;
    description?: string;
    metadata?: Record<string, unknown>;
  }) {
    return this.post('/proposals', data);
  }

  async updateProposal(id: string, data: Record<string, unknown>) {
    return this.patch(`/proposals/${id}`, data);
  }

  async deleteProposal(id: string) {
    return this.delete(`/proposals/${id}`);
  }

  // ==================== Proposal Sections/Boards ====================

  async getSections(proposalId: string) {
    return this.get(`/proposals/${proposalId}/sections`);
  }

  async createSection(proposalId: string, data: { name: string; description?: string }) {
    return this.post(`/proposals/${proposalId}/sections`, data);
  }

  async updateSection(proposalId: string, sectionId: string, data: Record<string, unknown>) {
    return this.patch(`/proposals/${proposalId}/sections/${sectionId}`, data);
  }

  async deleteSection(proposalId: string, sectionId: string) {
    return this.delete(`/proposals/${proposalId}/sections/${sectionId}`);
  }

  // ==================== Proposal Items ====================

  async addItem(
    proposalId: string,
    sectionId: string,
    item: {
      productId: string;
      variantId?: string;
      quantity: number;
      notes?: string;
    }
  ) {
    return this.post(`/proposals/${proposalId}/sections/${sectionId}/items`, item);
  }

  async updateItem(proposalId: string, itemId: string, data: Record<string, unknown>) {
    return this.patch(`/proposals/${proposalId}/items/${itemId}`, data);
  }

  async removeItem(proposalId: string, itemId: string) {
    return this.delete(`/proposals/${proposalId}/items/${itemId}`);
  }

  // ==================== Proposal Actions ====================

  async sendProposal(id: string, data?: { message?: string; recipients?: string[] }) {
    return this.post(`/proposals/${id}/send`, data);
  }

  async duplicateProposal(id: string) {
    return this.post(`/proposals/${id}/duplicate`);
  }

  async exportProposal(id: string, format: 'pdf' | 'excel') {
    return this.get(`/proposals/${id}/export`, { params: { format }, responseType: 'blob' });
  }

  async shareProposal(id: string, data: { email: string; message?: string }) {
    return this.post(`/proposals/${id}/share`, data);
  }
}
