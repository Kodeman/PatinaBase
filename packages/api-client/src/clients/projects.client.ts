/**
 * Projects API Client
 * Handles project management, tasks, RFIs, change orders, and milestones
 */

import { BaseApiClient } from '../base-client';
import { ApiClientConfig } from '../types';

export class ProjectsApiClient extends BaseApiClient {
  constructor(config: ApiClientConfig) {
    super(config);
  }

  // ==================== Projects ====================

  async getProjects(params?: { designerId?: string; status?: string }) {
    return this.get('/projects', { params });
  }

  async getProject(id: string) {
    return this.get(`/projects/${id}`);
  }

  async createProject(data: unknown) {
    return this.post('/projects', data);
  }

  async updateProject(id: string, data: unknown) {
    return this.patch(`/projects/${id}`, data);
  }

  async deleteProject(id: string) {
    return this.delete(`/projects/${id}`);
  }

  async getTimeline(projectId: string) {
    return this.get(`/projects/${projectId}/timeline`);
  }

  // ==================== Tasks ====================

  async getTasks(projectId: string) {
    return this.get(`/projects/${projectId}/tasks`);
  }

  async createTask(projectId: string, data: unknown) {
    return this.post(`/projects/${projectId}/tasks`, data);
  }

  async updateTask(taskId: string, data: unknown) {
    return this.patch(`/tasks/${taskId}`, data);
  }

  async deleteTask(taskId: string) {
    return this.delete(`/tasks/${taskId}`);
  }

  // ==================== Task Comments ====================

  async getTaskComments(projectId: string, taskId: string) {
    return this.get(`/projects/${projectId}/tasks/${taskId}/comments`);
  }

  async addTaskComment(projectId: string, taskId: string, data: { text: string; mentions?: string[] }) {
    return this.post(`/projects/${projectId}/tasks/${taskId}/comments`, data);
  }

  async deleteTaskComment(projectId: string, taskId: string, commentId: string) {
    return this.delete(`/projects/${projectId}/tasks/${taskId}/comments/${commentId}`);
  }

  // ==================== RFIs (Request For Information) ====================

  async getRFIs(projectId: string) {
    return this.get(`/projects/${projectId}/rfis`);
  }

  async createRFI(projectId: string, data: unknown) {
    return this.post(`/projects/${projectId}/rfis`, data);
  }

  async updateRFI(rfiId: string, data: unknown) {
    return this.patch(`/rfis/${rfiId}`, data);
  }

  // ==================== Change Orders ====================

  async getChangeOrders(projectId: string) {
    return this.get(`/projects/${projectId}/change-orders`);
  }

  async createChangeOrder(projectId: string, data: unknown) {
    return this.post(`/projects/${projectId}/change-orders`, data);
  }

  async updateChangeOrder(changeOrderId: string, data: unknown) {
    return this.patch(`/change-orders/${changeOrderId}`, data);
  }

  // ==================== Milestones ====================

  async getMilestones(projectId: string) {
    return this.get(`/projects/${projectId}/milestones`);
  }

  async getMilestone(projectId: string, milestoneId: string) {
    return this.get(`/projects/${projectId}/milestones/${milestoneId}`);
  }

  async createMilestone(projectId: string, data: unknown) {
    return this.post(`/projects/${projectId}/milestones`, data);
  }

  // ==================== Documents ====================

  async getDocuments(projectId: string) {
    return this.get(`/projects/${projectId}/documents`);
  }

  async uploadDocument(projectId: string, data: FormData) {
    return this.post(`/projects/${projectId}/documents`, data);
  }

  async getDocumentDownloadUrl(projectId: string, documentId: string) {
    return this.get(`/projects/${projectId}/documents/${documentId}/download-url`);
  }

  async getDocumentVersions(projectId: string, title: string) {
    return this.get(`/projects/${projectId}/documents/versions/${encodeURIComponent(title)}`);
  }

  // ==================== Timeline Segments ====================

  async getTimelineSegments(projectId: string) {
    return this.get(`/projects/${projectId}/timeline/segments`);
  }

  async createTimelineSegment(projectId: string, data: unknown) {
    return this.post(`/projects/${projectId}/timeline/segments`, data);
  }

  async updateTimelineSegment(projectId: string, segmentId: string, data: unknown) {
    return this.patch(`/projects/${projectId}/timeline/segments/${segmentId}`, data);
  }

  // ==================== Analytics & Progress ====================

  async getProjectProgress(projectId: string) {
    return this.get(`/projects/${projectId}/progress`);
  }

  async getProjectStats(projectId: string) {
    return this.get(`/projects/${projectId}/stats`);
  }

  async getActivityFeed(projectId: string, params?: { limit?: number; offset?: number }) {
    return this.get(`/projects/${projectId}/activity`, { params });
  }

  async getUpcomingEvents(projectId: string, days?: number) {
    return this.get(`/projects/${projectId}/upcoming-events`, { params: { days } });
  }

  // ==================== Approvals ====================

  async getApprovals(projectId: string) {
    return this.get(`/projects/${projectId}/approvals`);
  }

  async getApproval(projectId: string, approvalId: string) {
    return this.get(`/projects/${projectId}/approvals/${approvalId}`);
  }

  async submitApproval(
    projectId: string,
    approvalId: string,
    decision: 'approved' | 'rejected' | 'changes_requested',
    comment?: string
  ) {
    return this.post(`/projects/${projectId}/approvals/${approvalId}`, {
      decision,
      comment,
    });
  }
}
