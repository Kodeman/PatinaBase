import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { DocumentsService } from './documents.service';
import { CreateDocumentDto, DocumentCategory } from './dto/create-document.dto';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { GetCurrentUser } from '../common/decorators/current-user.decorator';
import { ProjectManage, ProjectRead } from '../common/decorators/project-authorization.decorator';

@ApiTags('documents')
@ApiBearerAuth()
@Controller('projects/:projectId/documents')
@UseGuards(ProjectAccessGuard)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post()
  @ProjectManage()
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
  @ProjectRead()
  @ApiOperation({ summary: 'Get all documents for a project' })
  @ApiResponse({ status: 200, description: 'Documents retrieved successfully' })
  findAll(
    @Param('projectId') projectId: string,
    @GetCurrentUser('id') userId: string,
    @Query('category') category?: DocumentCategory,
  ) {
    return this.documentsService.findAll(projectId, userId, category);
  }

  @Get('versions/:title')
  @ProjectRead()
  @ApiOperation({ summary: 'Get all versions of a document' })
  @ApiResponse({ status: 200, description: 'Document versions retrieved' })
  getVersions(
    @Param('projectId') projectId: string,
    @Param('title') title: string,
    @GetCurrentUser('id') userId: string,
  ) {
    return this.documentsService.getVersions(projectId, title, userId);
  }

  @Get(':id')
  @ProjectRead()
  @ApiOperation({ summary: 'Get document by ID' })
  @ApiResponse({ status: 200, description: 'Document retrieved successfully' })
  findOne(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @GetCurrentUser('id') userId: string,
  ) {
    return this.documentsService.findOne(projectId, id, userId);
  }

  @Delete(':id')
  @ProjectManage()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete document' })
  @ApiResponse({ status: 204, description: 'Document deleted successfully' })
  remove(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @GetCurrentUser('id') userId: string,
  ) {
    return this.documentsService.remove(projectId, id, userId);
  }
}
