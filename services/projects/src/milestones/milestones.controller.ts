import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { MilestonesService } from './milestones.service';
import { CreateMilestoneDto } from './dto/create-milestone.dto';
import { UpdateMilestoneDto } from './dto/update-milestone.dto';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { GetCurrentUser } from '../common/decorators/current-user.decorator';
import { ProjectManage, ProjectRead } from '../common/decorators/project-authorization.decorator';

@ApiTags('milestones')
@ApiBearerAuth()
@Controller('projects/:projectId/milestones')
@UseGuards(ProjectAccessGuard)
export class MilestonesController {
  constructor(private readonly milestonesService: MilestonesService) {}

  @Post()
  @ProjectManage()
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
  @ProjectRead()
  @ApiOperation({ summary: 'Get all milestones for a project' })
  @ApiResponse({ status: 200, description: 'Milestones retrieved successfully' })
  findAll(@Param('projectId') projectId: string, @GetCurrentUser('id') userId: string) {
    return this.milestonesService.findAll(projectId, userId);
  }

  @Get(':id')
  @ProjectRead()
  @ApiOperation({ summary: 'Get milestone by ID' })
  @ApiResponse({ status: 200, description: 'Milestone retrieved successfully' })
  findOne(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @GetCurrentUser('id') userId: string,
  ) {
    return this.milestonesService.findOne(projectId, id, userId);
  }

  @Patch(':id')
  @ProjectManage()
  @ApiOperation({ summary: 'Update milestone' })
  @ApiResponse({ status: 200, description: 'Milestone updated successfully' })
  update(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() updateDto: UpdateMilestoneDto,
    @GetCurrentUser('id') userId: string,
  ) {
    return this.milestonesService.update(projectId, id, updateDto, userId);
  }

  @Delete(':id')
  @ProjectManage()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete milestone' })
  @ApiResponse({ status: 204, description: 'Milestone deleted successfully' })
  remove(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @GetCurrentUser('id') userId: string,
  ) {
    return this.milestonesService.remove(projectId, id, userId);
  }
}
