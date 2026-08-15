import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { ProjectUpdatesService } from './project-updates.service';
import { CreateProjectUpdateDto } from './dto/create-project-update.dto';
import { ProjectUpdateResponseDto } from './dto/project-update-response.dto';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { GetCurrentUser } from '../common/decorators/current-user.decorator';
import { ProjectManage, ProjectRead } from '../common/decorators/project-authorization.decorator';

/**
 * Controller for project updates/timeline events
 */
@ApiTags('project-updates')
@ApiBearerAuth()
@Controller('projects/:projectId/updates')
@UseGuards(ProjectAccessGuard)
export class ProjectUpdatesController {
  constructor(private readonly projectUpdatesService: ProjectUpdatesService) {}

  /**
   * Create a new project update
   */
  @Post()
  @ProjectManage()
  @ApiOperation({ summary: 'Create a project update/timeline event' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({
    status: 201,
    description: 'Project update created successfully',
    type: ProjectUpdateResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async create(
    @Param('projectId') projectId: string,
    @Body() createDto: CreateProjectUpdateDto,
    @GetCurrentUser('id') userId: string,
  ): Promise<ProjectUpdateResponseDto> {
    return this.projectUpdatesService.create(projectId, createDto, userId);
  }

  /**
   * Get all updates for a project
   */
  @Get()
  @ProjectRead()
  @ApiOperation({ summary: 'Get all updates for a project' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({
    status: 200,
    description: 'Project updates retrieved successfully',
    type: [ProjectUpdateResponseDto],
  })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async findAll(
    @Param('projectId') projectId: string,
    @GetCurrentUser('id') userId: string,
  ): Promise<ProjectUpdateResponseDto[]> {
    return this.projectUpdatesService.findByProject(projectId, userId);
  }

  /**
   * Get a specific update by ID
   */
  @Get(':updateId')
  @ProjectRead()
  @ApiOperation({ summary: 'Get a specific project update' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiParam({ name: 'updateId', description: 'Update ID' })
  @ApiResponse({
    status: 200,
    description: 'Project update retrieved successfully',
    type: ProjectUpdateResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Update not found' })
  async findOne(
    @Param('projectId') projectId: string,
    @Param('updateId') updateId: string,
    @GetCurrentUser('id') userId: string,
  ): Promise<ProjectUpdateResponseDto> {
    return this.projectUpdatesService.findOne(projectId, updateId, userId);
  }

  /**
   * Delete a project update
   */
  @Delete(':updateId')
  @ProjectManage()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a project update' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiParam({ name: 'updateId', description: 'Update ID' })
  @ApiResponse({ status: 204, description: 'Update deleted successfully' })
  @ApiResponse({ status: 404, description: 'Update not found' })
  async remove(
    @Param('projectId') projectId: string,
    @Param('updateId') updateId: string,
    @GetCurrentUser('id') userId: string,
  ): Promise<void> {
    return this.projectUpdatesService.remove(projectId, updateId, userId);
  }
}
