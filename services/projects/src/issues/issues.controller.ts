import { Controller, Get, Post, Body, Patch, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { IssuesService } from './issues.service';
import { CreateIssueDto, IssueStatus } from './dto/create-issue.dto';
import { UpdateIssueDto } from './dto/update-issue.dto';
import { RolesGuard } from '../common/guards/roles.guard';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { GetCurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('issues')
@ApiBearerAuth()
@Controller('projects/:projectId/issues')
@UseGuards(RolesGuard, ProjectAccessGuard)
export class IssuesController {
  constructor(private readonly issuesService: IssuesService) {}

  @Post()
  @Roles('admin', 'designer', 'contractor', 'client')
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
  @Roles('admin', 'designer', 'client', 'contractor')
  @ApiOperation({ summary: 'Get all issues for a project' })
  @ApiResponse({ status: 200, description: 'Issues retrieved successfully' })
  findAll(@Param('projectId') projectId: string, @Query('status') status?: IssueStatus) {
    return this.issuesService.findAll(projectId, status);
  }

  @Get(':id')
  @Roles('admin', 'designer', 'client', 'contractor')
  @ApiOperation({ summary: 'Get issue by ID' })
  @ApiResponse({ status: 200, description: 'Issue retrieved successfully' })
  findOne(@Param('id') id: string) {
    return this.issuesService.findOne(id);
  }

  @Patch(':id')
  @Roles('admin', 'designer', 'contractor')
  @ApiOperation({ summary: 'Update issue' })
  @ApiResponse({ status: 200, description: 'Issue updated successfully' })
  update(
    @Param('id') id: string,
    @Body() updateDto: UpdateIssueDto,
    @GetCurrentUser('id') userId: string,
  ) {
    return this.issuesService.update(id, updateDto, userId);
  }
}
