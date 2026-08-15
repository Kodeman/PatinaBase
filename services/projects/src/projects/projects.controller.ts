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
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { QueryProjectsDto } from './dto/query-projects.dto';
import { ProjectResponseDto } from './dto/project-response.dto';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { GetCurrentUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { ProjectManage, ProjectRead } from '../common/decorators/project-authorization.decorator';

@ApiTags('projects')
@ApiBearerAuth()
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  @ProjectManage()
  @ApiOperation({ summary: 'Create a new project' })
  @ApiResponse({
    status: 201,
    description: 'Project created successfully',
    type: ProjectResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async create(
    @Body() createDto: CreateProjectDto,
    @GetCurrentUser('id') userId: string,
  ): Promise<ProjectResponseDto> {
    const project = await this.projectsService.create(createDto, userId);
    return ProjectResponseDto.fromPrisma(project)!;
  }

  @Get()
  @ProjectRead()
  @ApiOperation({ summary: 'Get all projects (filtered by role)' })
  @ApiResponse({
    status: 200,
    description: 'Projects retrieved successfully',
    type: [ProjectResponseDto],
  })
  async findAll(@Query() query: QueryProjectsDto, @GetCurrentUser() user: CurrentUser) {
    const result = await this.projectsService.findAll(query, user.id);
    return {
      data: ProjectResponseDto.fromPrismaMany(result.data),
      pagination: result.pagination,
    };
  }

  @Get(':id')
  @ProjectRead()
  @UseGuards(ProjectAccessGuard)
  @ApiOperation({ summary: 'Get project by ID' })
  @ApiResponse({
    status: 200,
    description: 'Project retrieved successfully',
    type: ProjectResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async findOne(
    @Param('id') id: string,
    @GetCurrentUser('id') userId: string,
  ): Promise<ProjectResponseDto> {
    const project = await this.projectsService.findOne(id, userId);
    return ProjectResponseDto.fromPrisma(project)!;
  }

  @Patch(':id')
  @ProjectManage()
  @UseGuards(ProjectAccessGuard)
  @ApiOperation({ summary: 'Update project' })
  @ApiResponse({
    status: 200,
    description: 'Project updated successfully',
    type: ProjectResponseDto,
  })
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
  @ProjectRead()
  @UseGuards(ProjectAccessGuard)
  @ApiOperation({ summary: 'Get project statistics' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  getStats(@Param('id') id: string, @GetCurrentUser('id') userId: string) {
    return this.projectsService.getStats(id, userId);
  }

  @Post('batch')
  @ProjectRead()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Batch fetch projects by IDs' })
  @ApiResponse({
    status: 200,
    description: 'Projects retrieved in order of requested IDs',
    type: [ProjectResponseDto],
  })
  async findByIds(
    @Body() body: { ids: string[] },
    @GetCurrentUser('id') userId: string,
  ): Promise<ProjectResponseDto[]> {
    const projects = await this.projectsService.findByIds(body.ids, userId);
    // CRITICAL: Return in same order as requested IDs for DataLoader
    const projectsMap = new Map(projects.map((p) => [p.id, p]));
    return body.ids.flatMap((id) => {
      const project = projectsMap.get(id);
      return project ? [ProjectResponseDto.fromPrisma(project)!] : [];
    });
  }

  @Get(':id/client-view')
  @ProjectRead()
  @UseGuards(ProjectAccessGuard)
  @ApiOperation({ summary: 'Get client-safe project data for client portal' })
  @ApiResponse({ status: 200, description: 'Client-safe data retrieved' })
  @ApiResponse({ status: 404, description: 'Project not found or access denied' })
  getClientView(@Param('id') id: string, @GetCurrentUser('id') clientId: string) {
    return this.projectsService.getClientSafeData(id, clientId);
  }

  @Get(':id/progress')
  @ProjectRead()
  @UseGuards(ProjectAccessGuard)
  @ApiOperation({ summary: 'Get comprehensive project progress metrics' })
  @ApiResponse({ status: 200, description: 'Progress metrics retrieved' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  getProgress(@Param('id') id: string, @GetCurrentUser('id') userId: string) {
    return this.projectsService.calculateProgress(id, userId);
  }

  @Get(':id/activity-feed')
  @ProjectRead()
  @UseGuards(ProjectAccessGuard)
  @ApiOperation({ summary: 'Get activity feed for project' })
  @ApiResponse({ status: 200, description: 'Activity feed retrieved' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  getActivityFeed(
    @Param('id') id: string,
    @GetCurrentUser('id') userId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 50;
    const offsetNum = offset ? parseInt(offset, 10) : 0;
    return this.projectsService.getActivityFeed(id, userId, limitNum, offsetNum);
  }

  @Get(':id/upcoming')
  @ProjectRead()
  @UseGuards(ProjectAccessGuard)
  @ApiOperation({ summary: 'Get upcoming events and deadlines' })
  @ApiResponse({ status: 200, description: 'Upcoming events retrieved' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  getUpcoming(
    @Param('id') id: string,
    @GetCurrentUser('id') userId: string,
    @Query('days') days?: string,
  ) {
    const daysAhead = days ? parseInt(days, 10) : 30;
    return this.projectsService.getUpcomingEvents(id, userId, daysAhead);
  }
}
