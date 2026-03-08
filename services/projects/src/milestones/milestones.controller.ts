import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { RequirePermissions } from '@patina/auth';
import { MilestonesService } from './milestones.service';
import { CreateMilestoneDto } from './dto/create-milestone.dto';
import { UpdateMilestoneDto } from './dto/update-milestone.dto';
import { RolesGuard } from '../common/guards/roles.guard';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { GetCurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('milestones')
@ApiBearerAuth()
@Controller('projects/:projectId/milestones')
@UseGuards(RolesGuard, ProjectAccessGuard)
export class MilestonesController {
  constructor(private readonly milestonesService: MilestonesService) {}

  @Post()
  @RequirePermissions('projects.milestone.create')
  @ApiOperation({ summary: 'Create a milestone' })
  @ApiResponse({ status: 201, description: 'Milestone created successfully' })
  create(
    @Param('projectId') projectId: string,
    @Body() createDto: CreateMilestoneDto,
    @GetCurrentUser('id') userId: string,
  ) {
    return this.milestonesService.create(projectId, createDto, userId);
  }

  @Get()
  @RequirePermissions('projects.milestone.read')
  @ApiOperation({ summary: 'Get all milestones for a project' })
  @ApiResponse({ status: 200, description: 'Milestones retrieved successfully' })
  findAll(@Param('projectId') projectId: string) {
    return this.milestonesService.findAll(projectId);
  }

  @Get(':id')
  @RequirePermissions('projects.milestone.read')
  @ApiOperation({ summary: 'Get milestone by ID' })
  @ApiResponse({ status: 200, description: 'Milestone retrieved successfully' })
  findOne(@Param('id') id: string) {
    return this.milestonesService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('projects.milestone.update')
  @ApiOperation({ summary: 'Update milestone' })
  @ApiResponse({ status: 200, description: 'Milestone updated successfully' })
  update(
    @Param('id') id: string,
    @Body() updateDto: UpdateMilestoneDto,
    @GetCurrentUser('id') userId: string,
  ) {
    return this.milestonesService.update(id, updateDto, userId);
  }

  @Delete(':id')
  @RequirePermissions('projects.milestone.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete milestone' })
  @ApiResponse({ status: 204, description: 'Milestone deleted successfully' })
  remove(@Param('id') id: string, @GetCurrentUser('id') userId: string) {
    return this.milestonesService.remove(id, userId);
  }
}
