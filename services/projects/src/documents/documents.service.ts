import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { MediaClientService } from '../integrations/media-client.service';
import { CreateDocumentDto, DocumentCategory } from './dto/create-document.dto';
import { ProjectsAuthorizationResolver } from '../common/authorization/projects-authorization.resolver';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
    private mediaClient: MediaClientService,
    private readonly authorization: ProjectsAuthorizationResolver,
  ) {}

  /**
   * Initialize document upload - returns pre-signed URL
   */
  async initializeUpload(projectId: string, createDto: CreateDocumentDto, uploadedBy: string) {
    const validation = this.mediaClient.validateFile(
      createDto.title,
      createDto.mimeType || 'application/octet-stream',
      createDto.sizeBytes || 0,
    );

    if (!validation.valid) {
      throw new BadRequestException(validation.error);
    }

    const result = await this.authorization.withProjectAccess(
      uploadedBy,
      projectId,
      'manage',
      async (tx) => {
        const project = await tx.project.findUnique({
          where: { id: projectId },
          select: { id: true },
        });
        if (!project) throw new NotFoundException('Project not found');
        const existing = await tx.document.findFirst({
          where: { projectId, title: createDto.title },
          orderBy: { version: 'desc' },
        });
        const uploadData = await this.mediaClient.getUploadUrl({
          projectId,
          category: createDto.category,
          filename: createDto.title,
          mimeType: createDto.mimeType,
          fileSize: createDto.sizeBytes,
        });
        const document = await tx.document.create({
          data: {
            ...createDto,
            projectId,
            uploadedBy,
            version: existing ? existing.version + 1 : 1,
            key: uploadData.key,
            metadata: { assetId: uploadData.assetId, uploadInitiatedAt: new Date() },
          },
        });
        return { document, uploadData };
      },
    );

    this.logger.log('Document upload initialized');
    return {
      document: result.document,
      uploadUrl: result.uploadData.uploadUrl,
      headers: result.uploadData.headers,
      expiresAt: result.uploadData.expiresAt,
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
        metadata: {
          projectId: document.projectId,
          category: document.category,
          version: document.version,
        },
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

  async findAll(projectId: string, userId: string, category?: DocumentCategory) {
    const where: any = { projectId };
    if (category) {
      where.category = category;
    }

    return this.authorization.withProjectAccess(userId, projectId, 'read', (tx) =>
      tx.document.findMany({
        where,
        orderBy: [{ category: 'asc' }, { title: 'asc' }, { version: 'desc' }],
      }),
    );
  }

  async findOne(projectId: string, id: string, userId: string) {
    return this.authorization.withProjectAccess(userId, projectId, 'read', async (tx) => {
      const document = await tx.document.findFirst({
        where: { id, projectId },
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
    });
  }

  async getVersions(projectId: string, title: string, userId: string) {
    return this.authorization.withProjectAccess(userId, projectId, 'read', (tx) =>
      tx.document.findMany({
        where: {
          projectId,
          title,
        },
        orderBy: { version: 'desc' },
      }),
    );
  }

  /**
   * Get download URL for a document
   */
  async getDownloadUrl(projectId: string, documentId: string, userId: string) {
    const document = await this.findOne(projectId, documentId, userId);

    if (!document.key) {
      throw new BadRequestException('Document key not found');
    }

    const downloadData = await this.mediaClient.getDownloadUrl(document.key);

    this.logger.log('Generated document download URL');

    return {
      downloadUrl: downloadData.downloadUrl,
      expiresIn: downloadData.expiresIn,
      filename: document.title,
      mimeType: document.mimeType,
    };
  }

  async remove(projectId: string, id: string, userId: string) {
    const existing = await this.authorization.withProjectAccess(
      userId,
      projectId,
      'manage',
      async (tx) => {
        const existing = await tx.document.findFirst({
          where: { id, projectId },
          select: { id: true, projectId: true, key: true, metadata: true },
        });
        if (!existing) throw new NotFoundException('Document not found');
        await tx.document.deleteMany({ where: { id, projectId } });
        await tx.auditLog.create({
          data: {
            entityType: 'document',
            entityId: id,
            action: 'deleted',
            actor: userId,
            metadata: { projectId },
          },
        });
        return existing;
      },
    );

    // Delete from object storage
    if (existing.key) {
      const metadata = existing.metadata as any;
      const assetId = metadata?.assetId;

      if (assetId) {
        this.mediaClient.deleteAsset(assetId).catch(() => {
          this.logger.error('Failed to delete document asset from media service');
        });
      }
    }

    this.logger.log('Document deleted');

    return { message: 'Document deleted successfully' };
  }
}
