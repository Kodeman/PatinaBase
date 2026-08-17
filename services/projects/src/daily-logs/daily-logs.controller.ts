import { Controller, Get, Post, Body, Patch, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { DailyLogsService } from './daily-logs.service';
import { CreateDailyLogDto } from './dto/create-daily-log.dto';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { GetCurrentUser } from '../common/decorators/current-user.decorator';
import { ProjectManage, ProjectRead } from '../common/decorators/project-authorization.decorator';

@ApiTags('daily-logs')
@ApiBearerAuth()
@Controller('projects/:projectId/logs')
@UseGuards(ProjectAccessGuard)
export class DailyLogsController {
  constructor(private readonly dailyLogsService: DailyLogsService) {}

  @Post()
  @ProjectManage()
  @ApiOperation({ summary: 'Create a daily log entry' })
  @ApiResponse({ status: 201, description: 'Log created successfully' })
  @ApiResponse({ status: 409, description: 'Log already exists for this date' })
  create(
    @Param('projectId') projectId: string,
    @Body() createDto: CreateDailyLogDto,
    @GetCurrentUser('id') userId: string,
  ) {
    return this.dailyLogsService.create(projectId, createDto, userId);
  }

  @Get()
  @ProjectRead()
  @ApiOperation({ summary: 'Get daily logs for a project' })
  @ApiResponse({ status: 200, description: 'Logs retrieved successfully' })
  findAll(
    @Param('projectId') projectId: string,
    @GetCurrentUser('id') userId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.dailyLogsService.findAll(projectId, userId, startDate, endDate);
  }

  @Get(':id')
  @ProjectRead()
  @ApiOperation({ summary: 'Get daily log by ID' })
  @ApiResponse({ status: 200, description: 'Log retrieved successfully' })
  findOne(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @GetCurrentUser('id') userId: string,
  ) {
    return this.dailyLogsService.findOne(projectId, id, userId);
  }

  @Patch(':id')
  @ProjectManage()
  @ApiOperation({ summary: 'Update daily log' })
  @ApiResponse({ status: 200, description: 'Log updated successfully' })
  update(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() updateDto: Partial<CreateDailyLogDto>,
    @GetCurrentUser('id') userId: string,
  ) {
    return this.dailyLogsService.update(projectId, id, updateDto, userId);
  }
}
