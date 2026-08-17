import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { MediaClientService } from '../integrations/media-client.service';
import { CreateDocumentDto, DocumentCategory } from './dto/create-document.dto';
import { ProjectsAuthorizationResolver } from '../common/authorization/projects-authorization.resolver';
import { randomUUID } from 'crypto';

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
  async initializeUpload(
    projectId: string,
    createDto: CreateDocumentDto,
    uploadedBy: string,
    authorizationHeader: string,
  ) {
    const validation = this.mediaClient.validateFile(
      createDto.title,
      createDto.mimeType || 'application/octet-stream',
      createDto.sizeBytes || 0,
    );

    if (!validation.valid) {
      throw new BadRequestException(validation.error);
    }

    const idempotencyKey = randomUUID();
    const result = await this.authorization.withProjectAccess(
      uploadedBy,
      projectId,
      'manage',
      async (tx) => {
        const project = await tx.project.findUnique({
          where: { id: projectId },
          select: { id: true, publicProjectId: true },
        });
        if (!project?.publicProjectId) throw new NotFoundException('Project not found');
        const existing = await tx.document.findFirst({
          where: { projectId, title: createDto.title },
          orderBy: { version: 'desc' },
        });
        const uploadData = await this.mediaClient.getUploadUrl(
          {
            publicProjectId: project.publicProjectId,
            category: createDto.category,
            filename: createDto.title,
            mimeType: createDto.mimeType,
            fileSize: createDto.sizeBytes,
          },
          authorizationHeader,
          idempotencyKey,
        );
        const document = await tx.document.create({
          data: {
            title: createDto.title,
            category: createDto.category,
            size: createDto.sizeBytes,
            mimeType: createDto.mimeType,
            projectId,
            uploadedBy,
            version: existing ? existing.version + 1 : 1,
            key: uploadData.key,
            metadata: {
              assetId: uploadData.assetId,
              uploadSessionId: uploadData.uploadSessionId,
              uploadInitiatedAt: new Date(),
            },
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
  async completeUpload(
    projectId: string,
    documentId: string,
    uploadedBy: string,
    authorizationHeader: string,
  ) {
    const pending = await this.authorization.withProjectAccess(
      uploadedBy,
      projectId,
      'manage',
      async (tx) => {
        const document = await tx.document.findFirst({
          where: { id: documentId, projectId },
        });
        if (!document) throw new NotFoundException('Document not found');
        const reference = this.mediaReference(document.metadata);
        if (!reference.uploadSessionId) {
          throw new BadRequestException('Document upload session not found');
        }
        return { document, uploadSessionId: reference.uploadSessionId };
      },
    );

    await this.mediaClient.confirmUpload(pending.uploadSessionId, authorizationHeader);

    const document = await this.authorization.withProjectAccess(
      uploadedBy,
      projectId,
      'manage',
      async (tx) => {
        const current = await tx.document.findFirst({ where: { id: documentId, projectId } });
        if (!current) throw new NotFoundException('Document not found');
        const currentReference = this.mediaReference(current.metadata);
        if (currentReference.uploadSessionId !== pending.uploadSessionId) {
          throw new NotFoundException('Document not found');
        }
        await tx.document.updateMany({
          where: { id: documentId, projectId },
          data: {
            metadata: {
              ...this.jsonObject(current.metadata),
              uploadCompletedAt: new Date(),
            },
          },
        });
        const updated = await tx.document.findFirstOrThrow({
          where: { id: documentId, projectId },
        });
        await tx.auditLog.create({
          data: {
            entityType: 'document',
            entityId: updated.id,
            action: 'uploaded',
            actor: uploadedBy,
            metadata: {
              projectId: updated.projectId,
              category: updated.category,
              version: updated.version,
            },
          },
        });
        return updated;
      },
    );

    this.eventEmitter.emit('document.uploaded', {
      documentId: document.id,
      projectId: document.projectId,
      category: document.category,
      version: document.version,
      uploadedBy,
      timestamp: new Date(),
    });

    return document;
  }

  /**
   * Legacy create method for backwards compatibility
   */
  async create(
    projectId: string,
    createDto: CreateDocumentDto,
    uploadedBy: string,
    authorizationHeader: string,
  ) {
    return this.initializeUpload(projectId, createDto, uploadedBy, authorizationHeader);
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
  async getDownloadUrl(
    projectId: string,
    documentId: string,
    userId: string,
    authorizationHeader: string,
  ) {
    const document = await this.findOne(projectId, documentId, userId);
    const assetId = this.mediaReference(document.metadata).assetId;
    if (!assetId) throw new BadRequestException('Document media asset not found');
    const downloadData = await this.mediaClient.getDownloadUrl(assetId, authorizationHeader);

    this.logger.log('Generated document download URL');

    return {
      downloadUrl: downloadData.downloadUrl,
      expiresIn: downloadData.expiresIn,
      filename: document.title,
      mimeType: document.mimeType,
    };
  }

  async remove(projectId: string, id: string, userId: string, authorizationHeader: string) {
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
        return existing;
      },
    );

    const assetId = this.mediaReference(existing.metadata).assetId;
    if (!assetId) throw new BadRequestException('Document media asset not found');
    await this.mediaClient.deleteAsset(assetId, authorizationHeader);

    await this.authorization.withProjectAccess(userId, projectId, 'manage', async (tx) => {
      const current = await tx.document.findFirst({ where: { id, projectId } });
      if (!current || this.mediaReference(current.metadata).assetId !== assetId) {
        throw new NotFoundException('Document not found');
      }
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
    });

    this.logger.log('Document deleted');

    return { message: 'Document deleted successfully' };
  }

  private mediaReference(metadata: unknown): { assetId?: string; uploadSessionId?: string } {
    const value = this.jsonObject(metadata);
    return {
      assetId: typeof value.assetId === 'string' ? value.assetId : undefined,
      uploadSessionId:
        typeof value.uploadSessionId === 'string' ? value.uploadSessionId : undefined,
    };
  }

  private jsonObject(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }
}
