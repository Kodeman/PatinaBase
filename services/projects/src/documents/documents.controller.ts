import { Controller, Get, Post, Body, Param, Delete, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { DocumentsService } from './documents.service';
import { CreateDocumentDto, DocumentCategory } from './dto/create-document.dto';
import { RolesGuard } from '../common/guards/roles.guard';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { GetCurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('documents')
@ApiBearerAuth()
@Controller('projects/:projectId/documents')
@UseGuards(RolesGuard, ProjectAccessGuard)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post()
  @Roles('admin', 'designer', 'contractor')
  @ApiOperation({ summary: 'Upload a document' })
  @ApiResponse({ status: 201, description: 'Document uploaded successfully' })
  create(
    @Param('projectId') projectId: string,
    @Body() createDto: CreateDocumentDto,
    @GetCurrentUser('id') userId: string,
  ) {
    return this.documentsService.create(projectId, createDto, userId);
  }

  @Get()
  @Roles('admin', 'designer', 'client', 'contractor')
  @ApiOperation({ summary: 'Get all documents for a project' })
  @ApiResponse({ status: 200, description: 'Documents retrieved successfully' })
  findAll(@Param('projectId') projectId: string, @Query('category') category?: DocumentCategory) {
    return this.documentsService.findAll(projectId, category);
  }

  @Get('versions/:title')
  @Roles('admin', 'designer', 'client')
  @ApiOperation({ summary: 'Get all versions of a document' })
  @ApiResponse({ status: 200, description: 'Document versions retrieved' })
  getVersions(@Param('projectId') projectId: string, @Param('title') title: string) {
    return this.documentsService.getVersions(projectId, title);
  }

  @Get(':id')
  @Roles('admin', 'designer', 'client', 'contractor')
  @ApiOperation({ summary: 'Get document by ID' })
  @ApiResponse({ status: 200, description: 'Document retrieved successfully' })
  findOne(@Param('id') id: string) {
    return this.documentsService.findOne(id);
  }

  @Delete(':id')
  @Roles('admin', 'designer')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete document' })
  @ApiResponse({ status: 204, description: 'Document deleted successfully' })
  remove(@Param('id') id: string, @GetCurrentUser('id') userId: string) {
    return this.documentsService.remove(id, userId);
  }
}
