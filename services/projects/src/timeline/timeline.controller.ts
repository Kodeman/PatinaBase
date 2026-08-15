import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { TimelineService } from './timeline.service';
import { ProgressAnalyticsService } from './progress-analytics.service';
import { CreateTimelineSegmentDto } from './dto/create-timeline-segment.dto';
import { UpdateTimelineSegmentDto } from './dto/update-timeline-segment.dto';
import { LogActivityDto } from './dto/log-activity.dto';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { GetCurrentUser } from '../common/decorators/current-user.decorator';
import { ProjectManage, ProjectRead } from '../common/decorators/project-authorization.decorator';
import { Request } from 'express';

@ApiTags('timeline')
@ApiBearerAuth()
@Controller('projects/:projectId/timeline')
@UseGuards(ProjectAccessGuard)
export class TimelineController {
  constructor(
    private readonly timelineService: TimelineService,
    private readonly progressAnalyticsService: ProgressAnalyticsService,
  ) {}

  @Post('segments')
  @ProjectManage()
  @ApiOperation({ summary: 'Create a new timeline segment' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({ status: 201, description: 'Segment created successfully' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  createSegment(
    @Param('projectId') projectId: string,
    @Body() createDto: CreateTimelineSegmentDto,
    @GetCurrentUser('id') userId: string,
  ) {
    return this.timelineService.createSegment(projectId, createDto, userId);
  }

  @Get()
  @ProjectRead()
  @ApiOperation({ summary: 'Get full project timeline with all segments' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({ status: 200, description: 'Timeline retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  getTimeline(@Param('projectId') projectId: string, @GetCurrentUser('id') userId: string) {
    return this.timelineService.getProjectTimeline(projectId, userId);
  }

  @Get('segment/:segmentId')
  @ProjectRead()
  @ApiOperation({ summary: 'Get specific timeline segment with details' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiParam({ name: 'segmentId', description: 'Segment ID' })
  @ApiResponse({ status: 200, description: 'Segment retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Segment not found' })
  getSegment(
    @Param('projectId') projectId: string,
    @Param('segmentId') segmentId: string,
    @GetCurrentUser('id') userId: string,
  ) {
    return this.timelineService.getSegment(projectId, segmentId, userId);
  }

  @Patch('segment/:segmentId')
  @ProjectManage()
  @ApiOperation({ summary: 'Update timeline segment' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiParam({ name: 'segmentId', description: 'Segment ID' })
  @ApiResponse({ status: 200, description: 'Segment updated successfully' })
  @ApiResponse({ status: 404, description: 'Segment not found' })
  updateSegment(
    @Param('projectId') projectId: string,
    @Param('segmentId') segmentId: string,
    @Body() updateDto: UpdateTimelineSegmentDto,
    @GetCurrentUser('id') userId: string,
  ) {
    return this.timelineService.updateSegment(projectId, segmentId, updateDto, userId);
  }

  @Post('activity')
  @HttpCode(HttpStatus.CREATED)
  @ProjectRead()
  @ApiOperation({ summary: 'Log client activity on timeline/project' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({ status: 201, description: 'Activity logged successfully' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  logActivity(
    @Param('projectId') projectId: string,
    @Body() logDto: LogActivityDto,
    @GetCurrentUser('id') userId: string,
    @Req() req: Request,
  ) {
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    return this.timelineService.logActivity(projectId, logDto, userId, ipAddress, userAgent);
  }

  @Get('upcoming')
  @ProjectRead()
  @ApiOperation({ summary: 'Get upcoming events, milestones, and deadlines' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiQuery({
    name: 'days',
    required: false,
    description: 'Number of days ahead to look (default: 30)',
  })
  @ApiResponse({ status: 200, description: 'Upcoming events retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  getUpcoming(
    @Param('projectId') projectId: string,
    @GetCurrentUser('id') userId: string,
    @Query('days') days?: string,
  ) {
    const daysAhead = days ? parseInt(days, 10) : 30;
    return this.timelineService.getUpcomingEvents(projectId, userId, daysAhead);
  }

  @Get('progress')
  @ProjectRead()
  @ApiOperation({ summary: 'Get detailed progress metrics for project' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({ status: 200, description: 'Progress metrics retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  getProgress(@Param('projectId') projectId: string, @GetCurrentUser('id') userId: string) {
    return this.timelineService.getProgressMetrics(projectId, userId);
  }

  // =============================================================================
  // IMMERSIVE TIMELINE ENDPOINTS
  // =============================================================================

  @Get('immersive')
  @ProjectRead()
  @ApiOperation({ summary: 'Get immersive timeline view for client portal' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({ status: 200, description: 'Immersive timeline retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  getImmersiveTimeline(
    @Param('projectId') projectId: string,
    @GetCurrentUser('id') userId: string,
  ) {
    return this.timelineService.getImmersiveTimeline(projectId, userId);
  }

  @Get('celebrations')
  @ProjectRead()
  @ApiOperation({ summary: 'Get recent milestone celebrations' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Number of celebrations to return (default: 5)',
  })
  @ApiResponse({ status: 200, description: 'Celebrations retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  getRecentCelebrations(
    @Param('projectId') projectId: string,
    @GetCurrentUser('id') userId: string,
    @Query('limit') limit?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 5;
    return this.timelineService.getRecentCelebrations(projectId, userId, limitNum);
  }

  @Get('celebrations/:milestoneId')
  @ProjectRead()
  @ApiOperation({ summary: 'Get specific milestone celebration data' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiParam({ name: 'milestoneId', description: 'Milestone ID' })
  @ApiResponse({ status: 200, description: 'Celebration data retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Milestone not found' })
  getMilestoneCelebration(
    @Param('projectId') projectId: string,
    @Param('milestoneId') milestoneId: string,
    @GetCurrentUser('id') userId: string,
  ) {
    return this.timelineService.getMilestoneCelebration(projectId, milestoneId, userId);
  }

  @Post('celebrations/:milestoneId/viewed')
  @HttpCode(HttpStatus.OK)
  @ProjectRead()
  @ApiOperation({ summary: 'Record that a celebration was viewed (for analytics)' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiParam({ name: 'milestoneId', description: 'Milestone ID' })
  @ApiResponse({ status: 200, description: 'View recorded successfully' })
  recordCelebrationViewed(
    @Param('projectId') projectId: string,
    @Param('milestoneId') milestoneId: string,
    @GetCurrentUser('id') userId: string,
  ) {
    return this.timelineService.recordCelebrationViewed(projectId, milestoneId, userId);
  }

  @Get('segment/:segmentId/media')
  @ProjectRead()
  @ApiOperation({ summary: 'Get media gallery for a timeline segment' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiParam({ name: 'segmentId', description: 'Segment ID' })
  @ApiResponse({ status: 200, description: 'Media gallery retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Segment not found' })
  getSegmentMediaGallery(
    @Param('projectId') projectId: string,
    @Param('segmentId') segmentId: string,
    @GetCurrentUser('id') userId: string,
  ) {
    return this.timelineService.getSegmentMediaGallery(projectId, segmentId, userId);
  }

  // =============================================================================
  // PROGRESS ANALYTICS ENDPOINTS
  // =============================================================================

  @Get('analytics/summary')
  @ProjectRead()
  @ApiOperation({ summary: 'Get comprehensive project progress analytics' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({ status: 200, description: 'Analytics summary retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  getProgressAnalytics(
    @Param('projectId') projectId: string,
    @GetCurrentUser('id') userId: string,
  ) {
    return this.progressAnalyticsService.getProjectProgress(projectId, userId);
  }

  @Get('analytics/health')
  @ProjectRead()
  @ApiOperation({ summary: 'Get project health indicators' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({ status: 200, description: 'Health indicators retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  getHealthIndicators(@Param('projectId') projectId: string, @GetCurrentUser('id') userId: string) {
    return this.progressAnalyticsService.getHealthIndicators(projectId, userId);
  }

  @Post('analytics/view')
  @HttpCode(HttpStatus.OK)
  @ProjectRead()
  @ApiOperation({ summary: 'Record timeline view for engagement tracking' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({ status: 200, description: 'View recorded successfully' })
  recordTimelineView(
    @Param('projectId') projectId: string,
    @GetCurrentUser('id') userId: string,
    @Body() body: { sessionId: string; durationSeconds?: number },
  ) {
    return this.progressAnalyticsService.recordTimelineView(
      projectId,
      userId,
      body.sessionId,
      body.durationSeconds,
    );
  }

  @Post('segment/:segmentId/media/opened')
  @HttpCode(HttpStatus.OK)
  @ProjectRead()
  @ApiOperation({ summary: 'Record media gallery open for engagement tracking' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiParam({ name: 'segmentId', description: 'Segment ID' })
  @ApiResponse({ status: 200, description: 'Gallery open recorded successfully' })
  recordMediaGalleryOpen(
    @Param('projectId') projectId: string,
    @Param('segmentId') segmentId: string,
    @GetCurrentUser('id') userId: string,
  ) {
    return this.progressAnalyticsService.recordMediaGalleryOpen(projectId, segmentId, userId);
  }
}
