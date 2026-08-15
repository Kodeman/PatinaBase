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
import { TasksService } from './tasks.service';
import { CreateTaskDto, TaskStatus } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskResponseDto } from './dto/task-response.dto';
import { CreateTaskCommentDto, TaskCommentDto } from './dto/create-task-comment.dto';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { GetCurrentUser } from '../common/decorators/current-user.decorator';
import { ProjectManage, ProjectRead } from '../common/decorators/project-authorization.decorator';

@ApiTags('tasks')
@ApiBearerAuth()
@Controller('projects/:projectId/tasks')
@UseGuards(ProjectAccessGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @ProjectManage()
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
  @ProjectRead()
  @ApiOperation({ summary: 'Get all tasks for a project' })
  @ApiResponse({
    status: 200,
    description: 'Tasks retrieved successfully',
    type: [TaskResponseDto],
  })
  async findAll(
    @Param('projectId') projectId: string,
    @GetCurrentUser('id') userId: string,
    @Query('status') status?: TaskStatus,
  ): Promise<TaskResponseDto[]> {
    const tasks = await this.tasksService.findAll(projectId, userId, status);
    return TaskResponseDto.fromPrismaMany(tasks);
  }

  @Get(':id')
  @ProjectRead()
  @ApiOperation({ summary: 'Get task by ID' })
  @ApiResponse({ status: 200, description: 'Task retrieved successfully', type: TaskResponseDto })
  @ApiResponse({ status: 404, description: 'Task not found' })
  async findOne(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @GetCurrentUser('id') userId: string,
  ): Promise<TaskResponseDto> {
    const task = await this.tasksService.findOne(projectId, id, userId);
    return TaskResponseDto.fromPrisma(task)!;
  }

  @Patch(':id')
  @ProjectManage()
  @ApiOperation({ summary: 'Update task' })
  @ApiResponse({ status: 200, description: 'Task updated successfully', type: TaskResponseDto })
  @ApiResponse({ status: 404, description: 'Task not found' })
  async update(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() updateDto: UpdateTaskDto,
    @GetCurrentUser('id') userId: string,
  ): Promise<TaskResponseDto> {
    const task = await this.tasksService.update(projectId, id, updateDto, userId);
    return TaskResponseDto.fromPrisma(task)!;
  }

  @Delete(':id')
  @ProjectManage()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete task' })
  @ApiResponse({ status: 204, description: 'Task deleted successfully' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  remove(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @GetCurrentUser('id') userId: string,
  ) {
    return this.tasksService.remove(projectId, id, userId);
  }

  @Post('bulk-update')
  @ProjectManage()
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
  @ProjectRead()
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
  @ProjectRead()
  @ApiOperation({ summary: 'Get all comments for a task' })
  @ApiResponse({
    status: 200,
    description: 'Comments retrieved successfully',
    type: [TaskCommentDto],
  })
  @ApiResponse({ status: 404, description: 'Task not found' })
  async getComments(
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
    @GetCurrentUser('id') userId: string,
  ): Promise<TaskCommentDto[]> {
    return this.tasksService.getComments(projectId, taskId, userId);
  }

  @Delete(':taskId/comments/:commentId')
  @ProjectManage()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a task comment' })
  @ApiResponse({ status: 204, description: 'Comment deleted successfully' })
  @ApiResponse({ status: 404, description: 'Task or comment not found' })
  @ApiResponse({ status: 403, description: 'Project management permission required' })
  async deleteComment(
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
    @Param('commentId') commentId: string,
    @GetCurrentUser('id') userId: string,
  ): Promise<void> {
    return this.tasksService.deleteComment(projectId, taskId, commentId, userId);
  }
}
