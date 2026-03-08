import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SegmentProgressDto {
  @ApiProperty()
  segmentId: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  phase: string;

  @ApiProperty({ description: 'Progress percentage 0-100' })
  progress: number;

  @ApiProperty()
  status: string;

  @ApiProperty()
  daysElapsed: number;

  @ApiProperty()
  daysRemaining: number;

  @ApiProperty({ description: 'Whether segment is on track based on progress vs time' })
  onTrack: boolean;

  @ApiPropertyOptional()
  estimatedCompletionDate?: Date;
}

export class MilestoneMetricsDto {
  @ApiProperty()
  totalMilestones: number;

  @ApiProperty()
  completedMilestones: number;

  @ApiProperty()
  upcomingMilestones: number;

  @ApiProperty()
  overdueMilestones: number;

  @ApiProperty({ description: 'Percentage of milestones completed on time' })
  onTimeCompletionRate: number;

  @ApiProperty({ description: 'Average days to complete a milestone' })
  avgCompletionDays: number;

  @ApiProperty()
  nextMilestone?: {
    id: string;
    title: string;
    targetDate: Date;
    daysUntil: number;
  };
}

export class ApprovalMetricsDto {
  @ApiProperty()
  totalApprovals: number;

  @ApiProperty()
  pendingApprovals: number;

  @ApiProperty()
  approvedCount: number;

  @ApiProperty()
  rejectedCount: number;

  @ApiProperty()
  needsDiscussionCount: number;

  @ApiProperty({ description: 'Average hours to get approval response' })
  avgResponseTimeHours: number;

  @ApiProperty({ description: 'Approval rate percentage' })
  approvalRate: number;

  @ApiProperty()
  pendingList: Array<{
    id: string;
    title: string;
    type: string;
    dueDate?: Date;
    daysPending: number;
    priority: 'low' | 'normal' | 'high' | 'urgent';
  }>;
}

export class EngagementMetricsDto {
  @ApiProperty({ description: 'Total timeline views in period' })
  totalViews: number;

  @ApiProperty({ description: 'Unique viewing sessions' })
  uniqueSessions: number;

  @ApiProperty({ description: 'Average time spent viewing timeline (seconds)' })
  avgViewDurationSeconds: number;

  @ApiProperty({ description: 'Most viewed segments' })
  popularSegments: Array<{
    segmentId: string;
    title: string;
    viewCount: number;
  }>;

  @ApiProperty({ description: 'Celebration views' })
  celebrationViews: number;

  @ApiProperty({ description: 'Media gallery opens' })
  mediaGalleryOpens: number;

  @ApiProperty({ description: 'Days since last client visit' })
  daysSinceLastVisit: number;
}

export class ProjectProgressSummaryDto {
  @ApiProperty()
  projectId: string;

  @ApiProperty()
  projectName: string;

  @ApiProperty({ description: 'Overall project progress percentage' })
  overallProgress: number;

  @ApiProperty({ description: 'Project health score 0-100' })
  healthScore: number;

  @ApiProperty()
  status: 'on_track' | 'at_risk' | 'behind' | 'ahead';

  @ApiProperty()
  currentPhase: string;

  @ApiProperty()
  startDate: Date;

  @ApiProperty()
  estimatedEndDate: Date;

  @ApiProperty()
  daysElapsed: number;

  @ApiProperty()
  daysRemaining: number;

  @ApiProperty()
  segmentProgress: SegmentProgressDto[];

  @ApiProperty()
  milestoneMetrics: MilestoneMetricsDto;

  @ApiProperty()
  approvalMetrics: ApprovalMetricsDto;

  @ApiProperty()
  engagement: EngagementMetricsDto;

  @ApiProperty()
  lastUpdated: Date;
}

export class ProjectHealthIndicatorDto {
  @ApiProperty()
  category: 'schedule' | 'approvals' | 'engagement' | 'milestones';

  @ApiProperty()
  score: number;

  @ApiProperty()
  status: 'good' | 'warning' | 'critical';

  @ApiProperty()
  message: string;

  @ApiPropertyOptional()
  recommendation?: string;
}
