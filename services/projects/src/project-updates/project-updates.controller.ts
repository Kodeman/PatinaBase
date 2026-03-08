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
import { RolesGuard } from '../common/guards/roles.guard';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { GetCurrentUser } from '../common/decorators/current-user.decorator';

/**
 * Controller for project updates/timeline events
 */
@ApiTags('project-updates')
@ApiBearerAuth()
@Controller('projects/:projectId/updates')
@UseGuards(RolesGuard, ProjectAccessGuard)
export class ProjectUpdatesController {
  constructor(private readonly projectUpdatesService: ProjectUpdatesService) {}

  /**
   * Create a new project update
   */
  @Post()
  @Roles('admin', 'designer')
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
  @Roles('admin', 'designer', 'client')
  @ApiOperation({ summary: 'Get all updates for a project' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({
    status: 200,
    description: 'Project updates retrieved successfully',
    type: [ProjectUpdateResponseDto],
  })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async findAll(@Param('projectId') projectId: string): Promise<ProjectUpdateResponseDto[]> {
    return this.projectUpdatesService.findByProject(projectId);
  }

  /**
   * Get a specific update by ID
   */
  @Get(':updateId')
  @Roles('admin', 'designer', 'client')
  @ApiOperation({ summary: 'Get a specific project update' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiParam({ name: 'updateId', description: 'Update ID' })
  @ApiResponse({
    status: 200,
    description: 'Project update retrieved successfully',
    type: ProjectUpdateResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Update not found' })
  async findOne(@Param('updateId') updateId: string): Promise<ProjectUpdateResponseDto> {
    return this.projectUpdatesService.findOne(updateId);
  }

  /**
   * Delete a project update
   */
  @Delete(':updateId')
  @Roles('admin', 'designer')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a project update' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiParam({ name: 'updateId', description: 'Update ID' })
  @ApiResponse({ status: 204, description: 'Update deleted successfully' })
  @ApiResponse({ status: 404, description: 'Update not found' })
  async remove(
    @Param('updateId') updateId: string,
    @GetCurrentUser('id') userId: string,
  ): Promise<void> {
    return this.projectUpdatesService.remove(updateId, userId);
  }
}
