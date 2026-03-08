/**
 * Project Tracking Types
 *
 * This is the single source of truth for all project-related types.
 * Backend DTOs and frontend types should import from here.
 */

// =============================================================================
// PROJECT STATUS
// =============================================================================

/**
 * Project lifecycle status
 * - draft: Initial creation, not yet started
 * - pending_approval: Awaiting client or stakeholder approval to begin
 * - active: Work in progress
 * - on_hold: Temporarily paused
 * - completed: All work finished, awaiting final sign-off
 * - substantial_completion: Major work done, minor items remaining
 * - closed: Project fully closed and archived
 * - cancelled: Project terminated before completion
 */
export type ProjectStatus =
  | 'draft'
  | 'pending_approval'
  | 'active'
  | 'on_hold'
  | 'completed'
  | 'substantial_completion'
  | 'closed'
  | 'cancelled';

export const PROJECT_STATUS_VALUES: readonly ProjectStatus[] = [
  'draft',
  'pending_approval',
  'active',
  'on_hold',
  'completed',
  'substantial_completion',
  'closed',
  'cancelled',
] as const;

// =============================================================================
// TASK STATUS
// =============================================================================

export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done' | 'cancelled';

export const TASK_STATUS_VALUES: readonly TaskStatus[] = [
  'todo',
  'in_progress',
  'blocked',
  'done',
  'cancelled',
] as const;

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export const TASK_PRIORITY_VALUES: readonly TaskPriority[] = [
  'low',
  'medium',
  'high',
  'urgent',
] as const;

// =============================================================================
// RFI STATUS
// =============================================================================

export type RFIStatus = 'open' | 'answered' | 'closed' | 'cancelled';

export const RFI_STATUS_VALUES: readonly RFIStatus[] = [
  'open',
  'answered',
  'closed',
  'cancelled',
] as const;

export type RFIPriority = 'normal' | 'urgent';

export const RFI_PRIORITY_VALUES: readonly RFIPriority[] = ['normal', 'urgent'] as const;

// =============================================================================
// CHANGE ORDER STATUS
// =============================================================================

export type ChangeOrderStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'implemented';

export const CHANGE_ORDER_STATUS_VALUES: readonly ChangeOrderStatus[] = [
  'draft',
  'submitted',
  'approved',
  'rejected',
  'implemented',
] as const;

// =============================================================================
// ISSUE STATUS & SEVERITY
// =============================================================================

export type IssueStatus = 'open' | 'investigating' | 'resolved' | 'closed' | 'wont_fix';

export const ISSUE_STATUS_VALUES: readonly IssueStatus[] = [
  'open',
  'investigating',
  'resolved',
  'closed',
  'wont_fix',
] as const;

export type IssueSeverity = 'low' | 'medium' | 'high' | 'critical';

export const ISSUE_SEVERITY_VALUES: readonly IssueSeverity[] = [
  'low',
  'medium',
  'high',
  'critical',
] as const;

// =============================================================================
// MILESTONE STATUS
// =============================================================================

/**
 * Milestone lifecycle status (backend canonical values)
 * - pending: Not yet started
 * - in_progress: Work underway
 * - completed: Successfully finished
 * - delayed: Behind schedule
 * - blocked: Cannot proceed due to dependency/issue
 * - cancelled: Will not be completed
 */
export type MilestoneStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'delayed'
  | 'blocked'
  | 'cancelled';

export const MILESTONE_STATUS_VALUES: readonly MilestoneStatus[] = [
  'pending',
  'in_progress',
  'completed',
  'delayed',
  'blocked',
  'cancelled',
] as const;

/**
 * Client-facing milestone status for UI display
 * Maps from backend MilestoneStatus to more user-friendly terms
 */
export type ClientMilestoneStatus =
  | 'completed'
  | 'in_progress'
  | 'upcoming'
  | 'blocked'
  | 'attention';

export const CLIENT_MILESTONE_STATUS_VALUES: readonly ClientMilestoneStatus[] = [
  'completed',
  'in_progress',
  'upcoming',
  'blocked',
  'attention',
] as const;

/**
 * Map backend MilestoneStatus to client-friendly ClientMilestoneStatus
 */
export function mapMilestoneStatusToClient(status: MilestoneStatus): ClientMilestoneStatus {
  switch (status) {
    case 'completed':
      return 'completed';
    case 'in_progress':
      return 'in_progress';
    case 'pending':
      return 'upcoming';
    case 'blocked':
      return 'blocked';
    case 'delayed':
    case 'cancelled':
      return 'attention';
  }
}

// =============================================================================
// TIMELINE SEGMENT STATUS
// =============================================================================

/**
 * Timeline segment status for client-visible project phases
 */
export type TimelineSegmentStatus = 'pending' | 'in_progress' | 'completed' | 'delayed';

export const TIMELINE_SEGMENT_STATUS_VALUES: readonly TimelineSegmentStatus[] = [
  'pending',
  'in_progress',
  'completed',
  'delayed',
] as const;

// =============================================================================
// APPROVAL STATUS & TYPE
// =============================================================================

/**
 * Approval workflow status
 * - pending: Awaiting decision
 * - needs_discussion: Requires clarification/discussion before decision
 * - approved: Approved by assignee
 * - rejected: Rejected by assignee
 * - cancelled: Approval request withdrawn
 */
export type ApprovalStatus =
  | 'pending'
  | 'needs_discussion'
  | 'approved'
  | 'rejected'
  | 'cancelled';

export const APPROVAL_STATUS_VALUES: readonly ApprovalStatus[] = [
  'pending',
  'needs_discussion',
  'approved',
  'rejected',
  'cancelled',
] as const;

/**
 * Type of approval being requested
 */
export type ApprovalType =
  | 'design_concept'
  | 'material_selection'
  | 'budget_change'
  | 'timeline_change'
  | 'final_delivery'
  | 'milestone'
  | 'change_order'
  | 'general';

export const APPROVAL_TYPE_VALUES: readonly ApprovalType[] = [
  'design_concept',
  'material_selection',
  'budget_change',
  'timeline_change',
  'final_delivery',
  'milestone',
  'change_order',
  'general',
] as const;

export type ApprovalPriority = 'low' | 'normal' | 'high' | 'urgent';

export const APPROVAL_PRIORITY_VALUES: readonly ApprovalPriority[] = [
  'low',
  'normal',
  'high',
  'urgent',
] as const;

export interface Project {
  id: string;
  proposalId?: string;
  title: string;
  clientId: string;
  designerId: string;
  status: ProjectStatus;
  startDate?: Date;
  endDate?: Date;
  actualEnd?: Date;
  budget?: number;
  currency: string;
  description?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  assigneeId?: string;
  dueDate?: Date;
  status: TaskStatus;
  priority: TaskPriority;
  order: number;
  completedAt?: Date;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface RFI {
  id: string;
  projectId: string;
  title: string;
  question: string;
  answer?: string;
  requestedBy: string;
  assignedTo?: string;
  dueDate?: Date;
  status: RFIStatus;
  priority: RFIPriority;
  answeredAt?: Date;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChangeOrder {
  id: string;
  projectId: string;
  title: string;
  description: string;
  requestedBy: string;
  costImpact?: number;
  scheduleImpact?: number; // Days
  status: ChangeOrderStatus;
  reason?: string;
  approvedBy?: string;
  approvedAt?: Date;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Issue {
  id: string;
  projectId: string;
  title: string;
  description: string;
  reportedBy: string;
  assignedTo?: string;
  severity: IssueSeverity;
  status: IssueStatus;
  resolution?: string;
  resolvedAt?: Date;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface DailyLog {
  id: string;
  projectId: string;
  authorId: string;
  date: Date;
  notes?: string;
  weather?: 'Good' | 'Fair' | 'Poor' | 'N/A';
  photos?: string[];
  attendees?: string[];
  activities?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectDocument {
  id: string;
  projectId: string;
  title: string;
  key: string;
  category: 'contract' | 'drawing' | 'spec' | 'photo' | 'invoice' | 'other';
  version: number;
  size?: number;
  mimeType?: string;
  uploadedBy: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Milestone {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  targetDate: Date;
  completedAt?: Date;
  status: MilestoneStatus;
  order: number;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// APPROVAL RECORD
// =============================================================================

export interface ApprovalSignature {
  data: string;
  signerName: string;
  signerId: string;
  timestamp: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
}

export interface ApprovalRecord {
  id: string;
  projectId: string;
  segmentId?: string;
  title: string;
  description?: string;
  approvalType: ApprovalType;
  status: ApprovalStatus;
  priority: ApprovalPriority;
  requestedBy: string;
  assignedTo: string;
  approvedBy?: string;
  approvedAt?: Date;
  rejectedBy?: string;
  rejectedAt?: Date;
  rejectionReason?: string;
  dueDate?: Date;
  documents: string[];
  comments: unknown[];
  signature?: ApprovalSignature;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// TIMELINE SEGMENT
// =============================================================================

export interface TimelineSegment {
  id: string;
  projectId: string;
  milestoneId?: string;
  title: string;
  description?: string;
  phase?: string;
  status: TimelineSegmentStatus;
  startDate?: Date;
  targetDate?: Date;
  completedAt?: Date;
  progressPercentage: number;
  isClientVisible: boolean;
  order: number;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

// DTOs
export interface CreateProjectDTO {
  proposalId?: string;
  title: string;
  clientId: string;
  designerId: string;
  startDate?: Date;
  endDate?: Date;
  budget?: number;
  currency?: string;
  description?: string;
}

export interface CreateTaskDTO {
  projectId: string;
  title: string;
  description?: string;
  assigneeId?: string;
  dueDate?: Date;
  priority?: TaskPriority;
}

export interface ProjectWithDetails extends Project {
  tasks: Task[];
  rfis: RFI[];
  changeOrders: ChangeOrder[];
  issues: Issue[];
  milestones: Milestone[];
}
