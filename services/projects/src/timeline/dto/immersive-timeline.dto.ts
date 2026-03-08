import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { type TimelineSegmentStatus, type MilestoneStatus, type ApprovalStatus } from '@patina/types';

/**
 * DTOs for Immersive Timeline Experience
 * Supports progressive disclosure and rich media integration
 */

export class TimelineMediaDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  url: string;

  @ApiProperty({ enum: ['image', 'video', '3d', 'before_after'] })
  type: 'image' | 'video' | '3d' | 'before_after';

  @ApiPropertyOptional()
  caption?: string;

  @ApiPropertyOptional()
  thumbnailUrl?: string;

  @ApiPropertyOptional()
  order?: number;
}

export class SegmentNarrativeDto {
  @ApiProperty({ description: 'What is happening during this segment' })
  happening: string;

  @ApiProperty({ description: 'Key completed items' })
  completed: string[];

  @ApiProperty({ description: 'Next steps and what to expect' })
  nextSteps: string[];

  @ApiPropertyOptional({ description: 'Designer notes for the client' })
  designerNotes?: string;
}

export class ImmersiveSegmentDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty()
  phase: string;

  @ApiProperty()
  status: TimelineSegmentStatus;

  @ApiProperty()
  progress: number;

  @ApiProperty()
  startDate: Date;

  @ApiProperty()
  endDate: Date;

  @ApiProperty()
  order: number;

  @ApiPropertyOptional({ type: [TimelineMediaDto] })
  media?: TimelineMediaDto[];

  @ApiPropertyOptional({ type: SegmentNarrativeDto })
  narrative?: SegmentNarrativeDto;

  @ApiProperty({ description: 'Pending approvals count' })
  pendingApprovalsCount: number;

  @ApiProperty({ description: 'Total activities count' })
  activitiesCount: number;

  @ApiPropertyOptional({ description: 'Milestone associated with this segment' })
  milestone?: {
    id: string;
    title: string;
    status: MilestoneStatus;
    targetDate: Date;
    completedAt?: Date;
  };

  @ApiPropertyOptional({ description: 'Primary approval requiring attention' })
  primaryApproval?: {
    id: string;
    title: string;
    status: ApprovalStatus;
    dueDate?: Date;
    approvalType: string;
  };
}

export class TimelineProgressDto {
  @ApiProperty({ description: 'Overall project progress (0-100)' })
  overall: number;

  @ApiProperty({ description: 'Time elapsed percentage' })
  timeElapsed: number;

  @ApiProperty({ description: 'Milestones completed vs total' })
  milestones: {
    completed: number;
    total: number;
    percentage: number;
  };

  @ApiProperty({ description: 'Approvals cleared vs total' })
  approvals: {
    approved: number;
    pending: number;
    total: number;
    percentage: number;
  };
}

export class ImmersiveTimelineDto {
  @ApiProperty()
  projectId: string;

  @ApiProperty()
  projectTitle: string;

  @ApiProperty()
  projectStatus: string;

  @ApiProperty({ type: TimelineProgressDto })
  progress: TimelineProgressDto;

  @ApiProperty({ type: [ImmersiveSegmentDto] })
  segments: ImmersiveSegmentDto[];

  @ApiPropertyOptional({ description: 'Currently active segment (in_progress)' })
  activeSegmentId?: string;

  @ApiPropertyOptional({ description: 'Next milestone to celebrate' })
  nextMilestone?: {
    id: string;
    title: string;
    targetDate: Date;
    daysUntil: number;
  };

  @ApiPropertyOptional({ description: 'Items requiring client attention' })
  attentionRequired?: {
    pendingApprovals: number;
    overdueItems: number;
    unreadMessages: number;
  };
}

export class MilestoneCelebrationDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  description: string;

  @ApiProperty()
  completedAt: Date;

  @ApiProperty()
  completedBy: string;

  @ApiPropertyOptional({ type: [TimelineMediaDto] })
  celebrationMedia?: TimelineMediaDto[];

  @ApiPropertyOptional({ description: 'Designer message for the client' })
  designerMessage?: string;

  @ApiPropertyOptional({ description: 'Achievement badge type' })
  achievementType?: 'first_milestone' | 'halfway' | 'major_decision' | 'final_delivery' | 'on_time';

  @ApiProperty({ description: 'Milestone number in sequence' })
  milestoneNumber: number;

  @ApiProperty({ description: 'Total milestones in project' })
  totalMilestones: number;
}
