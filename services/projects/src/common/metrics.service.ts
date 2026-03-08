/**
 * Prometheus Metrics Service for Projects
 *
 * Exposes custom business metrics and performance counters
 */

import { Injectable } from '@nestjs/common';
import { register, Counter, Histogram, Gauge, Summary } from 'prom-client';

@Injectable()
export class MetricsService {
  // HTTP Metrics
  private readonly httpRequestDuration: Histogram;
  private readonly httpRequestTotal: Counter;
  private readonly httpRequestErrors: Counter;

  // Database Metrics
  private readonly dbQueryDuration: Histogram;
  private readonly dbQueryTotal: Counter;
  private readonly dbConnectionPool: Gauge;

  // Business Metrics - Projects
  private readonly projectsCreated: Counter;
  private readonly projectsCompleted: Counter;
  private readonly activeProjects: Gauge;
  private readonly projectDuration: Histogram;

  // Business Metrics - Approvals
  private readonly approvalsRequested: Counter;
  private readonly approvalsCompleted: Counter;
  private readonly approvalResponseTime: Histogram;
  private readonly pendingApprovals: Gauge;

  // Business Metrics - Documents
  private readonly documentsUploaded: Counter;
  private readonly documentDownloads: Counter;
  private readonly totalStorageUsed: Gauge;

  // Business Metrics - Milestones
  private readonly milestonesCompleted: Counter;
  private readonly milestonesOverdue: Gauge;

  // Business Metrics - Tasks
  private readonly tasksCreated: Counter;
  private readonly tasksCompleted: Counter;
  private readonly activeTasks: Gauge;

  constructor() {
    // HTTP Metrics
    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    });

    this.httpRequestTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
    });

    this.httpRequestErrors = new Counter({
      name: 'http_request_errors_total',
      help: 'Total number of HTTP request errors',
      labelNames: ['method', 'route', 'error_type'],
    });

    // Database Metrics
    this.dbQueryDuration = new Histogram({
      name: 'db_query_duration_seconds',
      help: 'Duration of database queries in seconds',
      labelNames: ['operation', 'table'],
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
    });

    this.dbQueryTotal = new Counter({
      name: 'db_queries_total',
      help: 'Total number of database queries',
      labelNames: ['operation', 'table', 'status'],
    });

    this.dbConnectionPool = new Gauge({
      name: 'db_connection_pool_size',
      help: 'Current size of database connection pool',
      labelNames: ['pool_type'],
    });

    // Business Metrics - Projects
    this.projectsCreated = new Counter({
      name: 'projects_created_total',
      help: 'Total number of projects created',
      labelNames: ['designer_id'],
    });

    this.projectsCompleted = new Counter({
      name: 'projects_completed_total',
      help: 'Total number of projects completed',
      labelNames: ['designer_id'],
    });

    this.activeProjects = new Gauge({
      name: 'projects_active',
      help: 'Current number of active projects',
      labelNames: ['status'],
    });

    this.projectDuration = new Histogram({
      name: 'project_duration_days',
      help: 'Duration of completed projects in days',
      labelNames: ['designer_id'],
      buckets: [7, 14, 30, 60, 90, 180, 365],
    });

    // Business Metrics - Approvals
    this.approvalsRequested = new Counter({
      name: 'approvals_requested_total',
      help: 'Total number of approvals requested',
      labelNames: ['approval_type', 'project_id'],
    });

    this.approvalsCompleted = new Counter({
      name: 'approvals_completed_total',
      help: 'Total number of approvals completed',
      labelNames: ['approval_type', 'status'],
    });

    this.approvalResponseTime = new Histogram({
      name: 'approval_response_time_hours',
      help: 'Time taken to respond to approval requests in hours',
      labelNames: ['approval_type', 'status'],
      buckets: [1, 4, 8, 24, 48, 72, 168],
    });

    this.pendingApprovals = new Gauge({
      name: 'approvals_pending',
      help: 'Current number of pending approvals',
      labelNames: ['approval_type'],
    });

    // Business Metrics - Documents
    this.documentsUploaded = new Counter({
      name: 'documents_uploaded_total',
      help: 'Total number of documents uploaded',
      labelNames: ['document_type', 'project_id'],
    });

    this.documentDownloads = new Counter({
      name: 'document_downloads_total',
      help: 'Total number of document downloads',
      labelNames: ['document_type'],
    });

    this.totalStorageUsed = new Gauge({
      name: 'documents_storage_bytes',
      help: 'Total storage used by documents in bytes',
      labelNames: ['document_type'],
    });

    // Business Metrics - Milestones
    this.milestonesCompleted = new Counter({
      name: 'milestones_completed_total',
      help: 'Total number of milestones completed',
      labelNames: ['project_id'],
    });

    this.milestonesOverdue = new Gauge({
      name: 'milestones_overdue',
      help: 'Current number of overdue milestones',
    });

    // Business Metrics - Tasks
    this.tasksCreated = new Counter({
      name: 'tasks_created_total',
      help: 'Total number of tasks created',
      labelNames: ['task_type', 'project_id'],
    });

    this.tasksCompleted = new Counter({
      name: 'tasks_completed_total',
      help: 'Total number of tasks completed',
      labelNames: ['task_type'],
    });

    this.activeTasks = new Gauge({
      name: 'tasks_active',
      help: 'Current number of active tasks',
      labelNames: ['status'],
    });
  }

  // HTTP Tracking Methods
  recordHttpRequest(method: string, route: string, statusCode: number, durationSeconds: number): void {
    this.httpRequestDuration.observe({ method, route, status_code: statusCode }, durationSeconds);
    this.httpRequestTotal.inc({ method, route, status_code: statusCode });

    if (statusCode >= 400) {
      this.httpRequestErrors.inc({ method, route, error_type: statusCode >= 500 ? 'server' : 'client' });
    }
  }

  // Database Tracking Methods
  recordDatabaseQuery(operation: string, table: string, durationSeconds: number, status: 'success' | 'error'): void {
    this.dbQueryDuration.observe({ operation, table }, durationSeconds);
    this.dbQueryTotal.inc({ operation, table, status });
  }

  setDatabaseConnectionPoolSize(poolType: string, size: number): void {
    this.dbConnectionPool.set({ pool_type: poolType }, size);
  }

  // Project Tracking Methods
  incrementProjectsCreated(designerId: string): void {
    this.projectsCreated.inc({ designer_id: designerId });
  }

  incrementProjectsCompleted(designerId: string, durationDays: number): void {
    this.projectsCompleted.inc({ designer_id: designerId });
    this.projectDuration.observe({ designer_id: designerId }, durationDays);
  }

  setActiveProjects(status: string, count: number): void {
    this.activeProjects.set({ status }, count);
  }

  // Approval Tracking Methods
  incrementApprovalsRequested(approvalType: string, projectId: string): void {
    this.approvalsRequested.inc({ approval_type: approvalType, project_id: projectId });
  }

  incrementApprovalsCompleted(approvalType: string, status: string, responseTimeHours: number): void {
    this.approvalsCompleted.inc({ approval_type: approvalType, status });
    this.approvalResponseTime.observe({ approval_type: approvalType, status }, responseTimeHours);
  }

  setPendingApprovals(approvalType: string, count: number): void {
    this.pendingApprovals.set({ approval_type: approvalType }, count);
  }

  // Document Tracking Methods
  incrementDocumentsUploaded(documentType: string, projectId: string): void {
    this.documentsUploaded.inc({ document_type: documentType, project_id: projectId });
  }

  incrementDocumentDownloads(documentType: string): void {
    this.documentDownloads.inc({ document_type: documentType });
  }

  setTotalStorageUsed(documentType: string, bytes: number): void {
    this.totalStorageUsed.set({ document_type: documentType }, bytes);
  }

  // Milestone Tracking Methods
  incrementMilestonesCompleted(projectId: string): void {
    this.milestonesCompleted.inc({ project_id: projectId });
  }

  setMilestonesOverdue(count: number): void {
    this.milestonesOverdue.set(count);
  }

  // Task Tracking Methods
  incrementTasksCreated(taskType: string, projectId: string): void {
    this.tasksCreated.inc({ task_type: taskType, project_id: projectId });
  }

  incrementTasksCompleted(taskType: string): void {
    this.tasksCompleted.inc({ task_type: taskType });
  }

  setActiveTasks(status: string, count: number): void {
    this.activeTasks.set({ status }, count);
  }

  // Get metrics in Prometheus format
  async getMetrics(): Promise<string> {
    return register.metrics();
  }

  // Get metrics as JSON
  async getMetricsJSON(): Promise<any> {
    return register.getMetricsAsJSON();
  }

  // Reset all metrics (useful for testing)
  resetMetrics(): void {
    register.resetMetrics();
  }
}
