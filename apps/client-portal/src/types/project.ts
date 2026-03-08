// Re-export canonical types from shared package
export {
  type ClientMilestoneStatus as MilestoneStatus,
  type ApprovalStatus,
  type ApprovalType,
  type ApprovalPriority,
  type MilestoneStatus as BackendMilestoneStatus,
  type TimelineSegmentStatus,
  mapMilestoneStatusToClient,
} from '@patina/types';

// Legacy alias for backwards compatibility - maps to ApprovalStatus
// 'changes_requested' is now 'needs_discussion' in the canonical type
export function mapLegacyApprovalStatus(
  status: 'approved' | 'pending' | 'rejected' | 'changes_requested'
): import('@patina/types').ApprovalStatus {
  if (status === 'changes_requested') {
    return 'needs_discussion';
  }
  return status;
}

export interface DocumentAttachment {
  id: string;
  title: string;
  description?: string;
  type?: string;
  url?: string;
  thumbnailUrl?: string;
  uploadedAt?: string;
  uploadedBy?: string;
}

export interface MilestoneTask {
  id: string;
  label: string;
  completed: boolean;
  completedAt?: string;
}

export interface TimelineMessage {
  id: string;
  authorId: string;
  authorName: string;
  authorRole?: string;
  body: string;
  createdAt: string;
  attachments?: DocumentAttachment[];
  isSystem?: boolean;
}

export interface MilestoneApproval {
  id: string;
  status: ApprovalStatus;
  summary?: string;
  requestedAt?: string;
  decidedAt?: string;
  dueDate?: string;
  requiresClientAction: boolean;
  totalValue?: number;
  currency?: string;
}

export interface MilestoneDetail {
  id: string;
  index: number;
  title: string;
  phase?: string;
  description?: string;
  status: MilestoneStatus;
  startDate?: string;
  targetDate?: string;
  completionDate?: string;
  progressPercentage: number;
  checklist: MilestoneTask[];
  documents: DocumentAttachment[];
  messages: TimelineMessage[];
  approval?: MilestoneApproval;
  threadId?: string;
  tags?: string[];
}

export interface ClientProjectOverview {
  id: string;
  name: string;
  code?: string;
  location?: string;
  summary?: string;
  currentPhase?: string;
  status: string;
  startDate?: string;
  projectedCompletionDate?: string;
  heroImageUrl?: string;
  progressPercentage: number;
  completedMilestones: number;
  totalMilestones: number;
  approvalsPending: number;
  unreadMessages: number;
  nextMilestone?: {
    id: string;
    title: string;
    targetDate?: string;
    status: MilestoneStatus;
  };
}

export interface ClientProjectView {
  project: ClientProjectOverview;
  milestones: MilestoneDetail[];
  lastUpdated?: string;
}

export interface ProjectListItem {
  id: string;
  name: string;
  code?: string;
  location?: string;
  heroImageUrl?: string;
  progressPercentage: number;
  status: string;
  currentPhase?: string;
  nextMilestoneTitle?: string;
  approvalsPending: number;
  unreadMessages: number;
}
