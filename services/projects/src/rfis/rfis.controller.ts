import { Controller, Get, Post, Body, Patch, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { RfisService } from './rfis.service';
import { CreateRFIDto, RFIStatus } from './dto/create-rfi.dto';
import { UpdateRFIDto } from './dto/update-rfi.dto';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { GetCurrentUser } from '../common/decorators/current-user.decorator';
import { ProjectManage, ProjectRead } from '../common/decorators/project-authorization.decorator';

@ApiTags('rfis')
@ApiBearerAuth()
@Controller('projects/:projectId/rfis')
@UseGuards(ProjectAccessGuard)
export class RfisController {
  constructor(private readonly rfisService: RfisService) {}

  @Post()
  @ProjectManage()
  @ApiOperation({ summary: 'Create a new RFI' })
  @ApiResponse({ status: 201, description: 'RFI created successfully' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  create(
    @Param('projectId') projectId: string,
    @Body() createDto: CreateRFIDto,
    @GetCurrentUser('id') userId: string,
  ) {
    return this.rfisService.create(projectId, createDto, userId);
  }

  @Get()
  @ProjectRead()
  @ApiOperation({ summary: 'Get all RFIs for a project' })
  @ApiResponse({ status: 200, description: 'RFIs retrieved successfully' })
  findAll(
    @Param('projectId') projectId: string,
    @GetCurrentUser('id') userId: string,
    @Query('status') status?: RFIStatus,
  ) {
    return this.rfisService.findAll(projectId, userId, status);
  }

  @Get('overdue')
  @ProjectRead()
  @ApiOperation({ summary: 'Get overdue RFIs' })
  @ApiResponse({ status: 200, description: 'Overdue RFIs retrieved successfully' })
  getOverdue(@Param('projectId') projectId: string, @GetCurrentUser('id') userId: string) {
    return this.rfisService.getOverdue(projectId, userId);
  }

  @Get(':id')
  @ProjectRead()
  @ApiOperation({ summary: 'Get RFI by ID' })
  @ApiResponse({ status: 200, description: 'RFI retrieved successfully' })
  @ApiResponse({ status: 404, description: 'RFI not found' })
  findOne(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @GetCurrentUser('id') userId: string,
  ) {
    return this.rfisService.findOne(projectId, id, userId);
  }

  @Patch(':id')
  @ProjectManage()
  @ApiOperation({ summary: 'Update RFI (answer, status, etc.)' })
  @ApiResponse({ status: 200, description: 'RFI updated successfully' })
  @ApiResponse({ status: 404, description: 'RFI not found' })
  update(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() updateDto: UpdateRFIDto,
    @GetCurrentUser('id') userId: string,
  ) {
    return this.rfisService.update(projectId, id, updateDto, userId);
  }
}
