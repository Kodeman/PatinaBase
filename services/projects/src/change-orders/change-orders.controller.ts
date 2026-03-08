import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ChangeOrdersService } from './change-orders.service';
import { CreateChangeOrderDto, ChangeOrderStatus } from './dto/create-change-order.dto';
import { ApproveChangeOrderDto } from './dto/approve-change-order.dto';
import { RolesGuard } from '../common/guards/roles.guard';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { GetCurrentUser, CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('change-orders')
@ApiBearerAuth()
@Controller()
@UseGuards(RolesGuard)
export class ChangeOrdersController {
  constructor(private readonly changeOrdersService: ChangeOrdersService) {}

  @Post('projects/:projectId/change-orders')
  @Roles('admin', 'designer')
  @UseGuards(ProjectAccessGuard)
  @ApiOperation({ summary: 'Create a new change order' })
  @ApiResponse({ status: 201, description: 'Change order created successfully' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  create(
    @Param('projectId') projectId: string,
    @Body() createDto: CreateChangeOrderDto,
    @GetCurrentUser('id') userId: string,
  ) {
    return this.changeOrdersService.create(projectId, createDto, userId);
  }

  @Get('projects/:projectId/change-orders')
  @Roles('admin', 'designer', 'client')
  @UseGuards(ProjectAccessGuard)
  @ApiOperation({ summary: 'Get all change orders for a project' })
  @ApiResponse({ status: 200, description: 'Change orders retrieved successfully' })
  findAll(@Param('projectId') projectId: string, @Query('status') status?: ChangeOrderStatus) {
    return this.changeOrdersService.findAll(projectId, status);
  }

  @Get('change-orders/pending-approvals')
  @Roles('admin', 'client')
  @ApiOperation({ summary: 'Get pending change order approvals for client' })
  @ApiResponse({ status: 200, description: 'Pending approvals retrieved successfully' })
  getPendingApprovals(@GetCurrentUser('id') userId: string) {
    return this.changeOrdersService.getPendingApprovals(userId);
  }

  @Get('change-orders/:id')
  @Roles('admin', 'designer', 'client')
  @ApiOperation({ summary: 'Get change order by ID' })
  @ApiResponse({ status: 200, description: 'Change order retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Change order not found' })
  findOne(@Param('id') id: string) {
    return this.changeOrdersService.findOne(id);
  }

  @Patch('change-orders/:id/submit')
  @Roles('admin', 'designer')
  @ApiOperation({ summary: 'Submit change order for client approval' })
  @ApiResponse({ status: 200, description: 'Change order submitted successfully' })
  @ApiResponse({ status: 400, description: 'Invalid status transition' })
  submit(@Param('id') id: string, @GetCurrentUser('id') userId: string) {
    return this.changeOrdersService.submit(id, userId);
  }

  @Patch('change-orders/:id/approve')
  @Roles('admin', 'client')
  @ApiOperation({ summary: 'Approve or reject change order' })
  @ApiResponse({ status: 200, description: 'Change order approval processed' })
  @ApiResponse({ status: 403, description: 'Only clients can approve change orders' })
  approve(
    @Param('id') id: string,
    @Body() approvalDto: ApproveChangeOrderDto,
    @GetCurrentUser() user: CurrentUser,
  ) {
    return this.changeOrdersService.approve(id, approvalDto, user.id, user.role);
  }

  @Patch('change-orders/:id/implement')
  @Roles('admin', 'designer')
  @ApiOperation({ summary: 'Mark change order as implemented' })
  @ApiResponse({ status: 200, description: 'Change order marked as implemented' })
  @ApiResponse({ status: 400, description: 'Change order not approved' })
  markImplemented(@Param('id') id: string, @GetCurrentUser('id') userId: string) {
    return this.changeOrdersService.markImplemented(id, userId);
  }
}
