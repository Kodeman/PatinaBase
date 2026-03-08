/**
 * Milestone status types
 */
export type MilestoneStatus =
  | 'upcoming'
  | 'in-progress'
  | 'completed'
  | 'approval-needed'
  | 'changes-requested'

/**
 * Checklist item within a milestone
 */
export interface ChecklistItem {
  id: string
  title: string
  completed: boolean
  completedAt?: Date
  assignee?: string
}

/**
 * Media item (image or video)
 */
export interface MilestoneMediaItem {
  id: string
  url: string
  type: 'image' | 'video'
  caption?: string
  thumbnail?: string
  uploadedBy?: string
  uploadedAt?: Date
}

/**
 * Document attachment
 */
export interface DocumentItem {
  id: string
  title: string
  description?: string
  url: string
  fileType: string // 'pdf', 'docx', 'jpg', etc.
  fileSize?: number // bytes
  uploadedBy?: string
  uploadedAt?: Date
}

/**
 * Message in communication thread
 */
export interface Message {
  id: string
  authorId: string
  authorName: string
  authorAvatar?: string
  authorRole: 'client' | 'designer' | 'contractor' | 'system'
  body: string
  createdAt: Date
  attachments?: MilestoneMediaItem[]
}

/**
 * Approval request data
 */
export interface ApprovalRequest {
  id: string
  title: string
  description: string
  status: 'pending' | 'approved' | 'rejected' | 'changes-requested'
  value?: number // monetary value if applicable
  currency?: string // 'USD', etc.
  documents?: DocumentItem[]
  approvedAt?: Date
  approvedBy?: string
  rejectionReason?: string
}

/**
 * Base milestone data
 */
export interface MilestoneData {
  id: string
  title: string
  description?: string
  sequenceNumber: number
  totalMilestones: number
  progress: number // 0-100
  status: MilestoneStatus
  date: Date
  phase?: string // e.g., "Design", "Construction"
}

/**
 * Full milestone detail with all associated data
 */
export interface MilestoneDetail extends MilestoneData {
  checklist?: ChecklistItem[]
  media?: MilestoneMediaItem[]
  documents?: DocumentItem[]
  messages?: Message[]
  approval?: ApprovalRequest
}
