import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { RequirePermissions } from '@patina/auth';
import { TasksService } from './tasks.service';
import { CreateTaskDto, TaskStatus } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskResponseDto } from './dto/task-response.dto';
import { CreateTaskCommentDto, TaskCommentDto } from './dto/create-task-comment.dto';
import { RolesGuard } from '../common/guards/roles.guard';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { GetCurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('tasks')
@ApiBearerAuth()
@Controller('projects/:projectId/tasks')
@UseGuards(RolesGuard, ProjectAccessGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @RequirePermissions('projects.task.create')
  @ApiOperation({ summary: 'Create a new task' })
  @ApiResponse({ status: 201, description: 'Task created successfully', type: TaskResponseDto })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async create(
    @Param('projectId') projectId: string,
    @Body() createDto: CreateTaskDto,
    @GetCurrentUser('id') userId: string,
  ): Promise<TaskResponseDto> {
    const task = await this.tasksService.create(projectId, createDto, userId);
    return TaskResponseDto.fromPrisma(task)!;
  }

  @Get()
  @RequirePermissions('projects.task.read')
  @ApiOperation({ summary: 'Get all tasks for a project' })
  @ApiResponse({ status: 200, description: 'Tasks retrieved successfully', type: [TaskResponseDto] })
  async findAll(@Param('projectId') projectId: string, @Query('status') status?: TaskStatus): Promise<TaskResponseDto[]> {
    const tasks = await this.tasksService.findAll(projectId, status);
    return TaskResponseDto.fromPrismaMany(tasks);
  }

  @Get(':id')
  @RequirePermissions('projects.task.read')
  @ApiOperation({ summary: 'Get task by ID' })
  @ApiResponse({ status: 200, description: 'Task retrieved successfully', type: TaskResponseDto })
  @ApiResponse({ status: 404, description: 'Task not found' })
  async findOne(@Param('id') id: string): Promise<TaskResponseDto> {
    const task = await this.tasksService.findOne(id);
    return TaskResponseDto.fromPrisma(task)!;
  }

  @Patch(':id')
  @RequirePermissions('projects.task.update')
  @ApiOperation({ summary: 'Update task' })
  @ApiResponse({ status: 200, description: 'Task updated successfully', type: TaskResponseDto })
  @ApiResponse({ status: 404, description: 'Task not found' })
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdateTaskDto,
    @GetCurrentUser('id') userId: string,
  ): Promise<TaskResponseDto> {
    const task = await this.tasksService.update(id, updateDto, userId);
    return TaskResponseDto.fromPrisma(task)!;
  }

  @Delete(':id')
  @RequirePermissions('projects.task.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete task' })
  @ApiResponse({ status: 204, description: 'Task deleted successfully' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  remove(@Param('id') id: string, @GetCurrentUser('id') userId: string) {
    return this.tasksService.remove(id, userId);
  }

  @Post('bulk-update')
  @RequirePermissions('projects.task.update')
  @ApiOperation({ summary: 'Bulk update task status' })
  @ApiResponse({ status: 200, description: 'Tasks updated successfully' })
  async bulkUpdate(
    @Param('projectId') projectId: string,
    @Body() body: { taskIds: string[]; status: TaskStatus },
    @GetCurrentUser('id') userId: string,
  ) {
    return this.tasksService.bulkUpdateStatus(projectId, body.taskIds, body.status, userId);
  }

  // Task Comments Endpoints

  @Post(':taskId/comments')
  @RequirePermissions('projects.task.update')
  @ApiOperation({ summary: 'Add a comment to a task' })
  @ApiResponse({ status: 201, description: 'Comment added successfully', type: TaskCommentDto })
  @ApiResponse({ status: 404, description: 'Task not found' })
  async addComment(
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
    @Body() createCommentDto: CreateTaskCommentDto,
    @GetCurrentUser('id') userId: string,
    @GetCurrentUser('name') userName?: string,
  ): Promise<TaskCommentDto> {
    return this.tasksService.addComment(projectId, taskId, createCommentDto, userId, userName);
  }

  @Get(':taskId/comments')
  @RequirePermissions('projects.task.read')
  @ApiOperation({ summary: 'Get all comments for a task' })
  @ApiResponse({ status: 200, description: 'Comments retrieved successfully', type: [TaskCommentDto] })
  @ApiResponse({ status: 404, description: 'Task not found' })
  async getComments(
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
  ): Promise<TaskCommentDto[]> {
    return this.tasksService.getComments(projectId, taskId);
  }

  @Delete(':taskId/comments/:commentId')
  @RequirePermissions('projects.task.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a task comment' })
  @ApiResponse({ status: 204, description: 'Comment deleted successfully' })
  @ApiResponse({ status: 404, description: 'Task or comment not found' })
  @ApiResponse({ status: 403, description: 'Only comment author or admin can delete' })
  async deleteComment(
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
    @Param('commentId') commentId: string,
    @GetCurrentUser('id') userId: string,
    @GetCurrentUser('role') userRole?: string,
  ): Promise<void> {
    return this.tasksService.deleteComment(projectId, taskId, commentId, userId, userRole);
  }
}
