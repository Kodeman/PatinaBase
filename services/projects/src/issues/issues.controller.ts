import { Controller, Get, Post, Body, Patch, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { IssuesService } from './issues.service';
import { CreateIssueDto, IssueStatus } from './dto/create-issue.dto';
import { UpdateIssueDto } from './dto/update-issue.dto';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { GetCurrentUser } from '../common/decorators/current-user.decorator';
import { ProjectManage, ProjectRead } from '../common/decorators/project-authorization.decorator';

@ApiTags('issues')
@ApiBearerAuth()
@Controller('projects/:projectId/issues')
@UseGuards(ProjectAccessGuard)
export class IssuesController {
  constructor(private readonly issuesService: IssuesService) {}

  @Post()
  @ProjectRead()
  @ApiOperation({ summary: 'Create a new issue' })
  @ApiResponse({ status: 201, description: 'Issue created successfully' })
  create(
    @Param('projectId') projectId: string,
    @Body() createDto: CreateIssueDto,
    @GetCurrentUser('id') userId: string,
  ) {
    return this.issuesService.create(projectId, createDto, userId);
  }

  @Get()
  @ProjectRead()
  @ApiOperation({ summary: 'Get all issues for a project' })
  @ApiResponse({ status: 200, description: 'Issues retrieved successfully' })
  findAll(
    @Param('projectId') projectId: string,
    @GetCurrentUser('id') userId: string,
    @Query('status') status?: IssueStatus,
  ) {
    return this.issuesService.findAll(projectId, userId, status);
  }

  @Get(':id')
  @ProjectRead()
  @ApiOperation({ summary: 'Get issue by ID' })
  @ApiResponse({ status: 200, description: 'Issue retrieved successfully' })
  findOne(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @GetCurrentUser('id') userId: string,
  ) {
    return this.issuesService.findOne(projectId, id, userId);
  }

  @Patch(':id')
  @ProjectManage()
  @ApiOperation({ summary: 'Update issue' })
  @ApiResponse({ status: 200, description: 'Issue updated successfully' })
  update(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() updateDto: UpdateIssueDto,
    @GetCurrentUser('id') userId: string,
  ) {
    return this.issuesService.update(projectId, id, updateDto, userId);
  }
}
