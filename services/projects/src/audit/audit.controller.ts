import { Controller, Get, Query, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit')
@UseGuards(RolesGuard)
@Roles('admin') // Only admins can access audit logs
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('logs')
  @ApiOperation({ summary: 'Query audit logs' })
  @ApiResponse({ status: 200, description: 'Audit logs retrieved successfully' })
  queryLogs(
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('action') action?: string,
    @Query('actor') actor?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.auditService.queryLogs({
      entityType,
      entityId,
      action,
      actor,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      page,
      limit,
    });
  }

  @Get('entity/:entityType/:entityId')
  @ApiOperation({ summary: 'Get full history of an entity' })
  @ApiResponse({ status: 200, description: 'Entity history retrieved successfully' })
  getEntityHistory(@Param('entityType') entityType: string, @Param('entityId') entityId: string) {
    return this.auditService.getEntityHistory(entityType, entityId);
  }

  @Get('projects/:projectId')
  @ApiOperation({ summary: 'Get complete audit trail for a project' })
  @ApiResponse({ status: 200, description: 'Project audit trail retrieved successfully' })
  getProjectAuditTrail(@Param('projectId') projectId: string) {
    return this.auditService.getProjectAuditTrail(projectId);
  }

  @Get('export')
  @ApiOperation({ summary: 'Export audit logs' })
  @ApiResponse({ status: 200, description: 'Audit logs exported successfully' })
  exportAuditTrail(
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('action') action?: string,
    @Query('actor') actor?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.auditService.exportAuditTrail({
      entityType,
      entityId,
      action,
      actor,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
  }
}
