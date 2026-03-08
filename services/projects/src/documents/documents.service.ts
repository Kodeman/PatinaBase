import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { MediaClientService } from '../integrations/media-client.service';
import { CreateDocumentDto, DocumentCategory } from './dto/create-document.dto';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
    private mediaClient: MediaClientService,
  ) {}

  /**
   * Initialize document upload - returns pre-signed URL
   */
  async initializeUpload(
    projectId: string,
    createDto: CreateDocumentDto,
    uploadedBy: string,
  ) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Validate file
    const validation = this.mediaClient.validateFile(
      createDto.title,
      createDto.mimeType || 'application/octet-stream',
      createDto.sizeBytes || 0,
    );

    if (!validation.valid) {
      throw new BadRequestException(validation.error);
    }

    // Check if document with same title exists
    const existing = await this.prisma.document.findFirst({
      where: {
        projectId,
        title: createDto.title,
      },
      orderBy: { version: 'desc' },
    });

    // If exists, increment version
    const version = existing ? existing.version + 1 : 1;

    // Get pre-signed upload URL from media service
    const uploadData = await this.mediaClient.getUploadUrl({
      projectId,
      category: createDto.category,
      filename: createDto.title,
      mimeType: createDto.mimeType,
      fileSize: createDto.sizeBytes,
    });

    // Create document record
    const document = await this.prisma.document.create({
      data: {
        ...createDto,
        projectId,
        uploadedBy,
        version,
        key: uploadData.key,
        metadata: {
          assetId: uploadData.assetId,
          uploadInitiatedAt: new Date(),
        },
      },
    });

    this.logger.log(`Document upload initialized: ${document.id}`);

    return {
      document,
      uploadUrl: uploadData.uploadUrl,
      headers: uploadData.headers,
      expiresAt: uploadData.expiresAt,
    };
  }

  /**
   * Mark document upload as complete
   */
  async completeUpload(documentId: string, uploadedBy: string) {
    const document = await this.prisma.document.update({
      where: { id: documentId },
      data: {
        metadata: {
          uploadCompletedAt: new Date(),
        },
      },
      include: {
        project: { select: { id: true } },
      },
    });

    this.eventEmitter.emit('document.uploaded', {
      documentId: document.id,
      projectId: document.projectId,
      category: document.category,
      version: document.version,
      uploadedBy,
      timestamp: new Date(),
    });

    await this.prisma.auditLog.create({
      data: {
        entityType: 'document',
        entityId: document.id,
        action: 'uploaded',
        actor: uploadedBy,
        metadata: { projectId: document.projectId, category: document.category, version: document.version },
      },
    });

    return document;
  }

  /**
   * Legacy create method for backwards compatibility
   */
  async create(projectId: string, createDto: CreateDocumentDto, uploadedBy: string) {
    return this.initializeUpload(projectId, createDto, uploadedBy);
  }

  async findAll(projectId: string, category?: DocumentCategory) {
    const where: any = { projectId };
    if (category) {
      where.category = category;
    }

    return this.prisma.document.findMany({
      where,
      orderBy: [
        { category: 'asc' },
        { title: 'asc' },
        { version: 'desc' },
      ],
    });
  }

  async findOne(id: string) {
    const document = await this.prisma.document.findUnique({
      where: { id },
      include: {
        project: {
          select: { id: true, title: true },
        },
      },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    return document;
  }

  async getVersions(projectId: string, title: string) {
    return this.prisma.document.findMany({
      where: {
        projectId,
        title,
      },
      orderBy: { version: 'desc' },
    });
  }

  /**
   * Get download URL for a document
   */
  async getDownloadUrl(documentId: string, userId: string) {
    const document = await this.findOne(documentId);

    if (!document.key) {
      throw new BadRequestException('Document key not found');
    }

    const downloadData = await this.mediaClient.getDownloadUrl(document.key);

    this.logger.log(`Generated download URL for document ${documentId}`);

    return {
      downloadUrl: downloadData.downloadUrl,
      expiresIn: downloadData.expiresIn,
      filename: document.title,
      mimeType: document.mimeType,
    };
  }

  async remove(id: string, userId: string) {
    const existing = await this.prisma.document.findUnique({
      where: { id },
      select: { id: true, projectId: true, key: true, metadata: true },
    });

    if (!existing) {
      throw new NotFoundException('Document not found');
    }

    await this.prisma.document.delete({
      where: { id },
    });

    // Delete from object storage
    if (existing.key) {
      const metadata = existing.metadata as any;
      const assetId = metadata?.assetId;

      if (assetId) {
        this.mediaClient.deleteAsset(assetId).catch((error) => {
          this.logger.error(`Failed to delete asset ${assetId} from media service:`, error);
        });
      }
    }

    this.logger.log(`Document ${id} deleted. Object storage key: ${existing.key}`);

    await this.prisma.auditLog.create({
      data: {
        entityType: 'document',
        entityId: id,
        action: 'deleted',
        actor: userId,
        metadata: { projectId: existing.projectId, key: existing.key },
      },
    });

    return { message: 'Document deleted successfully' };
  }
}
