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
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { TimelineService } from './timeline.service';
import { ProgressAnalyticsService } from './progress-analytics.service';
import { CreateTimelineSegmentDto } from './dto/create-timeline-segment.dto';
import { UpdateTimelineSegmentDto } from './dto/update-timeline-segment.dto';
import { LogActivityDto } from './dto/log-activity.dto';
import { RolesGuard } from '../common/guards/roles.guard';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { GetCurrentUser } from '../common/decorators/current-user.decorator';
import { Request } from 'express';

@ApiTags('timeline')
@ApiBearerAuth()
@Controller('projects/:projectId/timeline')
@UseGuards(RolesGuard, ProjectAccessGuard)
export class TimelineController {
  constructor(
    private readonly timelineService: TimelineService,
    private readonly progressAnalyticsService: ProgressAnalyticsService,
  ) {}

  @Post('segments')
  @Roles('admin', 'designer')
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
  @Roles('admin', 'designer', 'client')
  @ApiOperation({ summary: 'Get full project timeline with all segments' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({ status: 200, description: 'Timeline retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  getTimeline(@Param('projectId') projectId: string) {
    return this.timelineService.getProjectTimeline(projectId);
  }

  @Get('segment/:segmentId')
  @Roles('admin', 'designer', 'client')
  @ApiOperation({ summary: 'Get specific timeline segment with details' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiParam({ name: 'segmentId', description: 'Segment ID' })
  @ApiResponse({ status: 200, description: 'Segment retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Segment not found' })
  getSegment(
    @Param('projectId') projectId: string,
    @Param('segmentId') segmentId: string,
  ) {
    return this.timelineService.getSegment(projectId, segmentId);
  }

  @Patch('segment/:segmentId')
  @Roles('admin', 'designer')
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
  @Roles('admin', 'designer', 'client')
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
  @Roles('admin', 'designer', 'client')
  @ApiOperation({ summary: 'Get upcoming events, milestones, and deadlines' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiQuery({ name: 'days', required: false, description: 'Number of days ahead to look (default: 30)' })
  @ApiResponse({ status: 200, description: 'Upcoming events retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  getUpcoming(
    @Param('projectId') projectId: string,
    @Query('days') days?: string,
  ) {
    const daysAhead = days ? parseInt(days, 10) : 30;
    return this.timelineService.getUpcomingEvents(projectId, daysAhead);
  }

  @Get('progress')
  @Roles('admin', 'designer', 'client')
  @ApiOperation({ summary: 'Get detailed progress metrics for project' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({ status: 200, description: 'Progress metrics retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  getProgress(@Param('projectId') projectId: string) {
    return this.timelineService.getProgressMetrics(projectId);
  }

  // =============================================================================
  // IMMERSIVE TIMELINE ENDPOINTS
  // =============================================================================

  @Get('immersive')
  @Roles('admin', 'designer', 'client')
  @ApiOperation({ summary: 'Get immersive timeline view for client portal' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({ status: 200, description: 'Immersive timeline retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  getImmersiveTimeline(@Param('projectId') projectId: string) {
    return this.timelineService.getImmersiveTimeline(projectId);
  }

  @Get('celebrations')
  @Roles('admin', 'designer', 'client')
  @ApiOperation({ summary: 'Get recent milestone celebrations' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of celebrations to return (default: 5)' })
  @ApiResponse({ status: 200, description: 'Celebrations retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  getRecentCelebrations(
    @Param('projectId') projectId: string,
    @Query('limit') limit?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 5;
    return this.timelineService.getRecentCelebrations(projectId, limitNum);
  }

  @Get('celebrations/:milestoneId')
  @Roles('admin', 'designer', 'client')
  @ApiOperation({ summary: 'Get specific milestone celebration data' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiParam({ name: 'milestoneId', description: 'Milestone ID' })
  @ApiResponse({ status: 200, description: 'Celebration data retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Milestone not found' })
  getMilestoneCelebration(
    @Param('projectId') projectId: string,
    @Param('milestoneId') milestoneId: string,
  ) {
    return this.timelineService.getMilestoneCelebration(projectId, milestoneId);
  }

  @Post('celebrations/:milestoneId/viewed')
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'designer', 'client')
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
  @Roles('admin', 'designer', 'client')
  @ApiOperation({ summary: 'Get media gallery for a timeline segment' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiParam({ name: 'segmentId', description: 'Segment ID' })
  @ApiResponse({ status: 200, description: 'Media gallery retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Segment not found' })
  getSegmentMediaGallery(
    @Param('projectId') projectId: string,
    @Param('segmentId') segmentId: string,
  ) {
    return this.timelineService.getSegmentMediaGallery(projectId, segmentId);
  }

  // =============================================================================
  // PROGRESS ANALYTICS ENDPOINTS
  // =============================================================================

  @Get('analytics/summary')
  @Roles('admin', 'designer', 'client')
  @ApiOperation({ summary: 'Get comprehensive project progress analytics' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({ status: 200, description: 'Analytics summary retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  getProgressAnalytics(@Param('projectId') projectId: string) {
    return this.progressAnalyticsService.getProjectProgress(projectId);
  }

  @Get('analytics/health')
  @Roles('admin', 'designer', 'client')
  @ApiOperation({ summary: 'Get project health indicators' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({ status: 200, description: 'Health indicators retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  getHealthIndicators(@Param('projectId') projectId: string) {
    return this.progressAnalyticsService.getHealthIndicators(projectId);
  }

  @Post('analytics/view')
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'designer', 'client')
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
  @Roles('admin', 'designer', 'client')
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
