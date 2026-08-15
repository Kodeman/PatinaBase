import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { UpdatePreferenceDto } from './dto/update-preference.dto';
import { GetCurrentUser } from '../common/decorators/current-user.decorator';
import { ProjectAdmin, ProjectRead } from '../common/decorators/project-authorization.decorator';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post()
  @ProjectAdmin()
  @ApiOperation({ summary: 'Create a new notification (admin/designer only)' })
  @ApiResponse({ status: 201, description: 'Notification created and queued' })
  create(@Body() createDto: CreateNotificationDto, @GetCurrentUser('id') userId: string) {
    return this.notificationsService.create(createDto, userId);
  }

  @Post('batch')
  @ProjectAdmin()
  @ApiOperation({ summary: 'Create multiple notifications in batch' })
  @ApiResponse({ status: 201, description: 'Notifications created' })
  createBatch(
    @Body() notifications: CreateNotificationDto[],
    @GetCurrentUser('id') userId: string,
  ) {
    return this.notificationsService.createBatch(notifications, userId);
  }

  @Get()
  @ProjectRead()
  @ApiOperation({ summary: 'Get notifications for current user' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'projectId', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  @ApiResponse({ status: 200, description: 'Notifications retrieved' })
  findForUser(
    @GetCurrentUser('id') userId: string,
    @Query('status') status?: string,
    @Query('projectId') projectId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.notificationsService.findForUser(userId, {
      status,
      projectId,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  @ProjectRead()
  @ApiOperation({ summary: 'Mark notification as read' })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  @ApiResponse({ status: 200, description: 'Notification marked as read' })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  markAsRead(@Param('id') id: string, @GetCurrentUser('id') userId: string) {
    return this.notificationsService.markAsRead(id, userId);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @ProjectRead()
  @ApiOperation({ summary: 'Mark all notifications as read' })
  @ApiQuery({ name: 'projectId', required: false, description: 'Limit to specific project' })
  @ApiResponse({ status: 200, description: 'All notifications marked as read' })
  markAllAsRead(@GetCurrentUser('id') userId: string, @Query('projectId') projectId?: string) {
    return this.notificationsService.markAllAsRead(userId, projectId);
  }

  @Get('preferences')
  @ProjectRead()
  @ApiOperation({ summary: 'Get notification preferences for current user' })
  @ApiResponse({ status: 200, description: 'Preferences retrieved' })
  getPreferences(@GetCurrentUser('id') userId: string) {
    return this.notificationsService.getOrCreatePreferences(userId);
  }

  @Patch('preferences')
  @ProjectRead()
  @ApiOperation({ summary: 'Update notification preferences' })
  @ApiResponse({ status: 200, description: 'Preferences updated' })
  updatePreferences(@GetCurrentUser('id') userId: string, @Body() updateDto: UpdatePreferenceDto) {
    return this.notificationsService.updatePreferences(userId, updateDto);
  }

  @Post('push-token')
  @HttpCode(HttpStatus.OK)
  @ProjectRead()
  @ApiOperation({ summary: 'Register a push notification token' })
  @ApiResponse({ status: 200, description: 'Token registered' })
  registerPushToken(@GetCurrentUser('id') userId: string, @Body() body: { token: string }) {
    return this.notificationsService.registerPushToken(userId, body.token);
  }
}
