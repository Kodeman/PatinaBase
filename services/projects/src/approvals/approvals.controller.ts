import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { ApprovalsService } from './approvals.service';
import { CreateApprovalDto } from './dto/create-approval.dto';
import { ApproveDto, RejectDto, DiscussDto, SignatureDto } from './dto/approval-action.dto';
import { RolesGuard } from '../common/guards/roles.guard';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { GetCurrentUser } from '../common/decorators/current-user.decorator';
import { Request } from 'express';

/**
 * Global approvals controller (cross-project)
 */
@ApiTags('approvals')
@ApiBearerAuth()
@Controller('approvals')
@UseGuards(RolesGuard)
export class GlobalApprovalsController {
  constructor(private readonly approvalsService: ApprovalsService) {}

  /**
   * Get all approvals for the current user (across all projects)
   */
  @Get()
  @Roles('admin', 'designer', 'client')
  @ApiOperation({ summary: 'Get all approvals for current user across projects' })
  @ApiQuery({ name: 'type', required: false, description: 'Filter by approval type' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status' })
  @ApiResponse({ status: 200, description: 'Approvals retrieved successfully' })
  async getUserApprovals(
    @Query('type') type?: string,
    @Query('status') status?: string,
    @GetCurrentUser('id') userId?: string,
  ) {
    if (!userId) {
      throw new BadRequestException('User ID is required');
    }
    return this.approvalsService.findByUser(userId, type, status);
  }
}

/**
 * Project-specific approvals controller
 */
@ApiTags('approvals')
@ApiBearerAuth()
@Controller('projects/:projectId/approvals')
@UseGuards(RolesGuard, ProjectAccessGuard)
export class ApprovalsController {
  constructor(private readonly approvalsService: ApprovalsService) {}

  @Post()
  @Roles('admin', 'designer')
  @ApiOperation({ summary: 'Create a new approval request' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({ status: 201, description: 'Approval created successfully' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  create(
    @Param('projectId') projectId: string,
    @Body() createDto: CreateApprovalDto,
    @GetCurrentUser('id') userId: string,
  ) {
    return this.approvalsService.create(projectId, createDto, userId);
  }

  @Get()
  @Roles('admin', 'designer', 'client')
  @ApiOperation({ summary: 'Get all approvals for a project' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status' })
  @ApiResponse({ status: 200, description: 'Approvals retrieved successfully' })
  findAll(
    @Param('projectId') projectId: string,
    @Query('status') status?: string,
  ) {
    return this.approvalsService.findByProject(projectId, status);
  }

  @Get('pending')
  @Roles('admin', 'designer', 'client')
  @ApiOperation({ summary: 'Get pending approvals for a project' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({ status: 200, description: 'Pending approvals retrieved' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  getPending(@Param('projectId') projectId: string) {
    return this.approvalsService.getPending(projectId);
  }

  @Get('metrics')
  @Roles('admin', 'designer')
  @ApiOperation({ summary: 'Get approval metrics for a project' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({ status: 200, description: 'Metrics retrieved successfully' })
  getMetrics(@Param('projectId') projectId: string) {
    return this.approvalsService.getApprovalMetrics(projectId);
  }

  @Get(':approvalId')
  @Roles('admin', 'designer', 'client')
  @ApiOperation({ summary: 'Get specific approval details' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiParam({ name: 'approvalId', description: 'Approval ID' })
  @ApiResponse({ status: 200, description: 'Approval retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Approval not found' })
  findOne(
    @Param('projectId') projectId: string,
    @Param('approvalId') approvalId: string,
  ) {
    return this.approvalsService.findOne(projectId, approvalId);
  }

  @Post(':approvalId/approve')
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'client')
  @ApiOperation({ summary: 'Approve an approval request' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiParam({ name: 'approvalId', description: 'Approval ID' })
  @ApiResponse({ status: 200, description: 'Approval approved successfully' })
  @ApiResponse({ status: 400, description: 'Invalid approval state' })
  @ApiResponse({ status: 403, description: 'Not authorized' })
  @ApiResponse({ status: 404, description: 'Approval not found' })
  approve(
    @Param('projectId') projectId: string,
    @Param('approvalId') approvalId: string,
    @Body() approveDto: ApproveDto,
    @GetCurrentUser('id') userId: string,
    @Req() req: Request,
  ) {
    const ipAddress = req.ip || req.socket.remoteAddress;
    return this.approvalsService.approve(projectId, approvalId, approveDto, userId, ipAddress);
  }

  @Post(':approvalId/reject')
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'client')
  @ApiOperation({ summary: 'Reject an approval request' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiParam({ name: 'approvalId', description: 'Approval ID' })
  @ApiResponse({ status: 200, description: 'Approval rejected successfully' })
  @ApiResponse({ status: 400, description: 'Invalid approval state' })
  @ApiResponse({ status: 403, description: 'Not authorized' })
  @ApiResponse({ status: 404, description: 'Approval not found' })
  reject(
    @Param('projectId') projectId: string,
    @Param('approvalId') approvalId: string,
    @Body() rejectDto: RejectDto,
    @GetCurrentUser('id') userId: string,
  ) {
    return this.approvalsService.reject(projectId, approvalId, rejectDto, userId);
  }

  @Post(':approvalId/discuss')
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'designer', 'client')
  @ApiOperation({ summary: 'Add a discussion comment to an approval' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiParam({ name: 'approvalId', description: 'Approval ID' })
  @ApiResponse({ status: 200, description: 'Comment added successfully' })
  @ApiResponse({ status: 404, description: 'Approval not found' })
  discuss(
    @Param('projectId') projectId: string,
    @Param('approvalId') approvalId: string,
    @Body() discussDto: DiscussDto,
    @GetCurrentUser('id') userId: string,
  ) {
    return this.approvalsService.discuss(projectId, approvalId, discussDto, userId);
  }

  @Put(':approvalId/signature')
  @Roles('admin', 'client')
  @ApiOperation({ summary: 'Add/update digital signature for an approval' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiParam({ name: 'approvalId', description: 'Approval ID' })
  @ApiResponse({ status: 200, description: 'Signature added successfully' })
  @ApiResponse({ status: 403, description: 'Not authorized' })
  @ApiResponse({ status: 404, description: 'Approval not found' })
  addSignature(
    @Param('projectId') projectId: string,
    @Param('approvalId') approvalId: string,
    @Body() signatureDto: SignatureDto,
    @GetCurrentUser('id') userId: string,
    @Req() req: Request,
  ) {
    const ipAddress = req.ip || req.socket.remoteAddress;
    return this.approvalsService.addSignature(projectId, approvalId, signatureDto, userId, ipAddress);
  }
}
