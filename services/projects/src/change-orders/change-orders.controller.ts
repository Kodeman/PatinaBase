import { Controller, Get, Post, Body, Patch, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ChangeOrdersService } from './change-orders.service';
import { CreateChangeOrderDto, ChangeOrderStatus } from './dto/create-change-order.dto';
import { ApproveChangeOrderDto } from './dto/approve-change-order.dto';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { GetCurrentUser } from '../common/decorators/current-user.decorator';
import {
  AuthorizedProjectId,
  ProjectEntity,
  ProjectManage,
  ProjectRead,
} from '../common/decorators/project-authorization.decorator';

@ApiTags('change-orders')
@ApiBearerAuth()
@Controller()
export class ChangeOrdersController {
  constructor(private readonly changeOrdersService: ChangeOrdersService) {}

  @Post('projects/:projectId/change-orders')
  @ProjectManage()
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
  @ProjectRead()
  @UseGuards(ProjectAccessGuard)
  @ApiOperation({ summary: 'Get all change orders for a project' })
  @ApiResponse({ status: 200, description: 'Change orders retrieved successfully' })
  findAll(
    @Param('projectId') projectId: string,
    @GetCurrentUser('id') userId: string,
    @Query('status') status?: ChangeOrderStatus,
  ) {
    return this.changeOrdersService.findAll(projectId, userId, status);
  }

  @Get('change-orders/pending-approvals')
  @ProjectRead()
  @ApiOperation({ summary: 'Get pending change order approvals for client' })
  @ApiResponse({ status: 200, description: 'Pending approvals retrieved successfully' })
  getPendingApprovals(@GetCurrentUser('id') userId: string) {
    return this.changeOrdersService.getPendingApprovals(userId);
  }

  @Get('change-orders/:id')
  @ProjectRead()
  @ProjectEntity('changeOrder')
  @UseGuards(ProjectAccessGuard)
  @ApiOperation({ summary: 'Get change order by ID' })
  @ApiResponse({ status: 200, description: 'Change order retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Change order not found' })
  findOne(
    @AuthorizedProjectId() projectId: string,
    @Param('id') id: string,
    @GetCurrentUser('id') userId: string,
  ) {
    return this.changeOrdersService.findOne(projectId, id, userId);
  }

  @Patch('change-orders/:id/submit')
  @ProjectManage()
  @ProjectEntity('changeOrder')
  @UseGuards(ProjectAccessGuard)
  @ApiOperation({ summary: 'Submit change order for client approval' })
  @ApiResponse({ status: 200, description: 'Change order submitted successfully' })
  @ApiResponse({ status: 400, description: 'Invalid status transition' })
  submit(
    @AuthorizedProjectId() projectId: string,
    @Param('id') id: string,
    @GetCurrentUser('id') userId: string,
  ) {
    return this.changeOrdersService.submit(projectId, id, userId);
  }

  @Patch('change-orders/:id/approve')
  @ProjectRead()
  @ProjectEntity('changeOrder')
  @UseGuards(ProjectAccessGuard)
  @ApiOperation({ summary: 'Approve or reject change order' })
  @ApiResponse({ status: 200, description: 'Change order approval processed' })
  @ApiResponse({ status: 403, description: 'Only clients can approve change orders' })
  approve(
    @AuthorizedProjectId() projectId: string,
    @Param('id') id: string,
    @Body() approvalDto: ApproveChangeOrderDto,
    @GetCurrentUser('id') userId: string,
  ) {
    return this.changeOrdersService.approve(projectId, id, approvalDto, userId);
  }

  @Patch('change-orders/:id/implement')
  @ProjectManage()
  @ProjectEntity('changeOrder')
  @UseGuards(ProjectAccessGuard)
  @ApiOperation({ summary: 'Mark change order as implemented' })
  @ApiResponse({ status: 200, description: 'Change order marked as implemented' })
  @ApiResponse({ status: 400, description: 'Change order not approved' })
  markImplemented(
    @AuthorizedProjectId() projectId: string,
    @Param('id') id: string,
    @GetCurrentUser('id') userId: string,
  ) {
    return this.changeOrdersService.markImplemented(projectId, id, userId);
  }
}
