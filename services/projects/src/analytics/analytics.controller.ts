import {
  Controller,
  Get,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { GetCurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('analytics')
@ApiBearerAuth()
@Controller()
@UseGuards(RolesGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('projects/:projectId/analytics')
  @UseGuards(ProjectAccessGuard)
  @Roles('admin', 'designer', 'client')
  @ApiOperation({ summary: 'Get comprehensive analytics dashboard for a project' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({ status: 200, description: 'Dashboard analytics retrieved' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  getDashboard(@Param('projectId') projectId: string) {
    return this.analyticsService.getDashboardAnalytics(projectId);
  }

  @Get('projects/:projectId/analytics/engagement')
  @UseGuards(ProjectAccessGuard)
  @Roles('admin', 'designer', 'client')
  @ApiOperation({ summary: 'Get detailed engagement metrics for a project' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({ status: 200, description: 'Engagement metrics retrieved' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  getEngagement(@Param('projectId') projectId: string) {
    return this.analyticsService.getProjectEngagement(projectId);
  }

  @Get('projects/:projectId/analytics/activity')
  @UseGuards(ProjectAccessGuard)
  @Roles('admin', 'designer', 'client')
  @ApiOperation({ summary: 'Get activity breakdown for a project' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiQuery({ name: 'days', required: false, description: 'Number of days to analyze (default: 30)' })
  @ApiResponse({ status: 200, description: 'Activity breakdown retrieved' })
  getActivityBreakdown(
    @Param('projectId') projectId: string,
    @Query('days') days?: string,
  ) {
    const daysNum = days ? parseInt(days, 10) : 30;
    return this.analyticsService.getActivityBreakdown(projectId, daysNum);
  }

  @Get('projects/:projectId/analytics/time-based')
  @UseGuards(ProjectAccessGuard)
  @Roles('admin', 'designer')
  @ApiOperation({ summary: 'Get time-based analytics (daily/hourly patterns)' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiQuery({ name: 'days', required: false, description: 'Number of days to analyze (default: 30)' })
  @ApiResponse({ status: 200, description: 'Time-based analytics retrieved' })
  getTimeBasedAnalytics(
    @Param('projectId') projectId: string,
    @Query('days') days?: string,
  ) {
    const daysNum = days ? parseInt(days, 10) : 30;
    return this.analyticsService.getTimeBasedAnalytics(projectId, daysNum);
  }

  @Get('projects/:projectId/analytics/approvals')
  @UseGuards(ProjectAccessGuard)
  @Roles('admin', 'designer')
  @ApiOperation({ summary: 'Get approval velocity and metrics' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({ status: 200, description: 'Approval metrics retrieved' })
  getApprovalVelocity(@Param('projectId') projectId: string) {
    return this.analyticsService.getApprovalVelocity(projectId);
  }

  @Get('projects/:projectId/analytics/satisfaction')
  @UseGuards(ProjectAccessGuard)
  @Roles('admin', 'designer')
  @ApiOperation({ summary: 'Get client satisfaction metrics' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({ status: 200, description: 'Satisfaction metrics retrieved' })
  getSatisfactionMetrics(@Param('projectId') projectId: string) {
    return this.analyticsService.getClientSatisfactionMetrics(projectId);
  }

  @Get('analytics/user')
  @Roles('admin', 'designer', 'client')
  @ApiOperation({ summary: 'Get analytics for current user across all projects' })
  @ApiQuery({ name: 'projectId', required: false, description: 'Filter by specific project' })
  @ApiResponse({ status: 200, description: 'User analytics retrieved' })
  getUserAnalytics(
    @GetCurrentUser('id') userId: string,
    @Query('projectId') projectId?: string,
  ) {
    return this.analyticsService.getUserAnalytics(userId, projectId);
  }

  @Get('projects/:projectId/analytics/entity/:entityType/:entityId')
  @UseGuards(ProjectAccessGuard)
  @Roles('admin', 'designer')
  @ApiOperation({ summary: 'Get interaction tracking for specific entity' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiParam({ name: 'entityType', description: 'Entity type (segment, document, etc.)' })
  @ApiParam({ name: 'entityId', description: 'Entity ID' })
  @ApiResponse({ status: 200, description: 'Entity interactions retrieved' })
  getEntityInteractions(
    @Param('projectId') projectId: string,
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
  ) {
    return this.analyticsService.getEntityInteractions(projectId, entityType, entityId);
  }

  @Put('projects/:projectId/analytics/satisfaction')
  @UseGuards(ProjectAccessGuard)
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'client')
  @ApiOperation({ summary: 'Update satisfaction score for a project' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({ status: 200, description: 'Satisfaction score updated' })
  @ApiResponse({ status: 400, description: 'Invalid score value' })
  @ApiResponse({ status: 404, description: 'Metrics not found' })
  updateSatisfactionScore(
    @Param('projectId') projectId: string,
    @Body() body: { score: number },
  ) {
    return this.analyticsService.updateSatisfactionScore(projectId, body.score);
  }
}
