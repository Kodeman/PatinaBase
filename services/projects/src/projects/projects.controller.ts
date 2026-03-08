import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Public, RequirePermissions } from '@patina/auth';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { QueryProjectsDto } from './dto/query-projects.dto';
import { ProjectResponseDto } from './dto/project-response.dto';
import { RolesGuard } from '../common/guards/roles.guard';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { GetCurrentUser, CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('projects')
@ApiBearerAuth()
@Controller('projects')
@UseGuards(RolesGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  @RequirePermissions('projects.project.create')
  @ApiOperation({ summary: 'Create a new project' })
  @ApiResponse({ status: 201, description: 'Project created successfully', type: ProjectResponseDto })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async create(@Body() createDto: CreateProjectDto, @GetCurrentUser('id') userId: string): Promise<ProjectResponseDto> {
    const project = await this.projectsService.create(createDto, userId);
    return ProjectResponseDto.fromPrisma(project)!;
  }

  @Get()
  @Public() // Allow unauthenticated access in development mode
  @RequirePermissions('projects.project.read')
  @ApiOperation({ summary: 'Get all projects (filtered by role)' })
  @ApiResponse({ status: 200, description: 'Projects retrieved successfully', type: [ProjectResponseDto] })
  async findAll(@Query() query: QueryProjectsDto, @GetCurrentUser() user?: CurrentUser) {
    // For development when @Public() is used, provide defaults if user is not authenticated
    const userId = user?.id || 'dev-user';
    const userRole = user?.role || 'admin';
    const result = await this.projectsService.findAll(query, userId, userRole);
    return {
      data: ProjectResponseDto.fromPrismaMany(result.data),
      pagination: result.pagination,
    };
  }

  @Get(':id')
  @RequirePermissions('projects.project.read')
  @UseGuards(ProjectAccessGuard)
  @ApiOperation({ summary: 'Get project by ID' })
  @ApiResponse({ status: 200, description: 'Project retrieved successfully', type: ProjectResponseDto })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async findOne(@Param('id') id: string): Promise<ProjectResponseDto> {
    const project = await this.projectsService.findOne(id);
    return ProjectResponseDto.fromPrisma(project)!;
  }

  @Patch(':id')
  @RequirePermissions('projects.project.update')
  @UseGuards(ProjectAccessGuard)
  @ApiOperation({ summary: 'Update project' })
  @ApiResponse({ status: 200, description: 'Project updated successfully', type: ProjectResponseDto })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdateProjectDto,
    @GetCurrentUser('id') userId: string,
  ): Promise<ProjectResponseDto> {
    const project = await this.projectsService.update(id, updateDto, userId);
    return ProjectResponseDto.fromPrisma(project)!;
  }

  @Get(':id/stats')
  @RequirePermissions('projects.project.read')
  @UseGuards(ProjectAccessGuard)
  @ApiOperation({ summary: 'Get project statistics' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  getStats(@Param('id') id: string) {
    return this.projectsService.getStats(id);
  }

  @Post('batch')
  @RequirePermissions('projects.project.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Batch fetch projects by IDs' })
  @ApiResponse({ status: 200, description: 'Projects retrieved in order of requested IDs', type: [ProjectResponseDto] })
  async findByIds(@Body() body: { ids: string[] }): Promise<(ProjectResponseDto | null)[]> {
    const projects = await this.projectsService.findByIds(body.ids);
    // CRITICAL: Return in same order as requested IDs for DataLoader
    const projectsMap = new Map(projects.map(p => [p.id, p]));
    return body.ids.map(id => {
      const project = projectsMap.get(id);
      return project ? ProjectResponseDto.fromPrisma(project)! : null;
    });
  }

  @Get(':id/client-view')
  @Public() // Allow unauthenticated access in development mode
  @RequirePermissions('projects.project.read')
  @UseGuards(ProjectAccessGuard)
  @ApiOperation({ summary: 'Get client-safe project data for client portal' })
  @ApiResponse({ status: 200, description: 'Client-safe data retrieved' })
  @ApiResponse({ status: 404, description: 'Project not found or access denied' })
  getClientView(
    @Param('id') id: string,
    @GetCurrentUser('id') clientId?: string,
  ) {
    // For development when @Public() is used, use a default client ID if not authenticated
    const actualClientId = clientId || 'dev-client';
    return this.projectsService.getClientSafeData(id, actualClientId);
  }

  @Get(':id/progress')
  @RequirePermissions('projects.project.read')
  @UseGuards(ProjectAccessGuard)
  @ApiOperation({ summary: 'Get comprehensive project progress metrics' })
  @ApiResponse({ status: 200, description: 'Progress metrics retrieved' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  getProgress(@Param('id') id: string) {
    return this.projectsService.calculateProgress(id);
  }

  @Get(':id/activity-feed')
  @RequirePermissions('projects.project.read')
  @UseGuards(ProjectAccessGuard)
  @ApiOperation({ summary: 'Get activity feed for project' })
  @ApiResponse({ status: 200, description: 'Activity feed retrieved' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  getActivityFeed(
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 50;
    const offsetNum = offset ? parseInt(offset, 10) : 0;
    return this.projectsService.getActivityFeed(id, limitNum, offsetNum);
  }

  @Get(':id/upcoming')
  @RequirePermissions('projects.project.read')
  @UseGuards(ProjectAccessGuard)
  @ApiOperation({ summary: 'Get upcoming events and deadlines' })
  @ApiResponse({ status: 200, description: 'Upcoming events retrieved' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  getUpcoming(
    @Param('id') id: string,
    @Query('days') days?: string,
  ) {
    const daysAhead = days ? parseInt(days, 10) : 30;
    return this.projectsService.getUpcomingEvents(id, daysAhead);
  }
}
