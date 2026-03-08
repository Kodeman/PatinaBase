import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaClient, AssetKind, AssetRole } from '../../generated/prisma-client';
import { OCIStorageService } from '../storage/oci-storage.service';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import * as mime from 'mime-types';

export interface UploadIntent {
  kind: AssetKind;
  filename: string;
  fileSize?: number;
  mimeType?: string;
  productId?: string;
  variantId?: string;
  role?: AssetRole;
}

export interface UploadResponse {
  assetId: string;
  uploadSessionId: string;
  parUrl: string;
  targetKey: string;
  headers: Record<string, string>;
  expiresAt: Date;
}

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  // Validation constants from PRD
  private readonly ALLOWED_IMAGE_MIMES = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/avif',
  ];

  private readonly ALLOWED_3D_MIMES = [
    'model/gltf-binary',
    'model/gltf+json',
    'model/vnd.usdz+zip',
    'application/octet-stream', // For GLB/USDZ
  ];

  private readonly MAX_IMAGE_SIZE = 50 * 1024 * 1024; // 50MB
  private readonly MAX_3D_SIZE = 500 * 1024 * 1024; // 500MB
  private readonly PAR_TTL_MINUTES = 15;

  constructor(
    private prisma: PrismaClient,
    private ociStorage: OCIStorageService,
    private config: ConfigService,
  ) {}

  /**
   * Create upload intent and generate PAR for direct upload
   */
  async createUploadIntent(
    userId: string,
    intent: UploadIntent,
    idempotencyKey?: string,
  ): Promise<UploadResponse> {
    // Validate intent
    this.validateUploadIntent(intent);

    // Check for existing session with idempotency key
    if (idempotencyKey) {
      const existing = await this.prisma.uploadSession.findUnique({
        where: { idempotencyKey },
      });

      if (existing) {
        this.logger.log(`Returning existing upload session for idempotency key: ${idempotencyKey}`);
        return {
          assetId: existing.assetId as string,
          uploadSessionId: existing.id,
          parUrl: existing.parUrl,
          targetKey: existing.targetKey,
          headers: this.getUploadHeaders(intent.mimeType),
          expiresAt: existing.expiresAt,
        };
      }
    }

    // Create asset record
    const assetId = uuidv4();
    const asset = await this.prisma.mediaAsset.create({
      data: {
        id: assetId,
        kind: intent.kind,
        productId: intent.productId,
        variantId: intent.variantId,
        role: intent.role,
        rawKey: '', // Will be set when upload completes
        status: 'PENDING',
        uploadedBy: userId,
        mimeType: intent.mimeType,
        sizeBytes: intent.fileSize,
      },
    });

    // Generate object key
    const targetKey = this.ociStorage.generateObjectKey(
      assetId,
      intent.kind === 'IMAGE' ? 'image' : '3d',
      intent.filename,
    );

    // Generate PAR for upload
    const expiresAt = new Date(Date.now() + this.PAR_TTL_MINUTES * 60 * 1000);
    const rawBucket = this.config.get('OCI_BUCKET_RAW');

    const par = await this.ociStorage.createPAR({
      bucketName: rawBucket,
      objectName: targetKey,
      accessType: 'ObjectWrite',
      timeExpires: expiresAt,
    });

    // Create upload session
    const session = await this.prisma.uploadSession.create({
      data: {
        assetId,
        filename: intent.filename,
        fileSize: intent.fileSize,
        mimeType: intent.mimeType as string,
        kind: intent.kind,
        parUrl: par.fullUrl,
        targetKey,
        expiresAt,
        status: 'PENDING',
        userId,
        productId: intent.productId,
        variantId: intent.variantId,
        role: intent.role,
        idempotencyKey,
      },
    });

    this.logger.log(
      `Created upload intent for asset ${assetId}, session ${session.id}, expires at ${expiresAt}`,
    );

    return {
      assetId,
      uploadSessionId: session.id,
      parUrl: par.fullUrl,
      targetKey,
      headers: this.getUploadHeaders(intent.mimeType),
      expiresAt,
    };
  }

  /**
   * Validate upload intent
   */
  private validateUploadIntent(intent: UploadIntent) {
    // Validate mime type
    const allowedMimes =
      intent.kind === 'IMAGE' ? this.ALLOWED_IMAGE_MIMES : this.ALLOWED_3D_MIMES;

    if (intent.mimeType && !allowedMimes.includes(intent.mimeType)) {
      throw new BadRequestException(
        `Invalid MIME type for ${intent.kind}. Allowed: ${allowedMimes.join(', ')}`,
      );
    }

    // Validate file size
    if (intent.fileSize) {
      const maxSize = intent.kind === 'IMAGE' ? this.MAX_IMAGE_SIZE : this.MAX_3D_SIZE;
      if (intent.fileSize > maxSize) {
        throw new BadRequestException(
          `File size exceeds maximum allowed (${maxSize} bytes for ${intent.kind})`,
        );
      }
    }

    // Validate filename
    if (!intent.filename || intent.filename.length > 255) {
      throw new BadRequestException('Invalid filename');
    }

    // Validate role if provided
    if (intent.role === 'HERO' && intent.kind !== 'IMAGE') {
      throw new BadRequestException('HERO role only valid for images');
    }
  }

  /**
   * Get required headers for upload
   */
  private getUploadHeaders(mimeType?: string): Record<string, string> {
    const headers: Record<string, string> = {
      'x-content-type': mimeType || 'application/octet-stream',
    };

    return headers;
  }

  /**
   * Confirm upload completion (called via webhook or polling)
   */
  async confirmUpload(sessionId: string): Promise<{ assetId: string; targetKey: string }> {
    const session = await this.prisma.uploadSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new BadRequestException('Upload session not found');
    }

    if (session.status === 'UPLOADED') {
      this.logger.log(`Upload session ${sessionId} already confirmed`);
      return { assetId: session.assetId as string, targetKey: session.targetKey };
    }

    // Update session and asset
    await this.prisma.$transaction([
      this.prisma.uploadSession.update({
        where: { id: sessionId },
        data: {
          status: 'UPLOADED',
          uploadedAt: new Date(),
        },
      }),
      this.prisma.mediaAsset.update({
        where: { id: session.assetId as string },
        data: {
          rawKey: session.targetKey,
        },
      }),
    ]);

    this.logger.log(`Confirmed upload for session ${sessionId}, asset ${session.assetId}`);

    // Enqueue processing job (will be handled by job service)
    return { assetId: session.assetId as string, targetKey: session.targetKey };
  }

  /**
   * Clean up expired upload sessions
   */
  async cleanupExpiredSessions() {
    const expired = await this.prisma.uploadSession.findMany({
      where: {
        expiresAt: { lt: new Date() },
        status: 'PENDING',
      },
    });

    if (expired.length > 0) {
      await this.prisma.uploadSession.updateMany({
        where: {
          id: { in: expired.map((s) => s.id) },
        },
        data: {
          status: 'EXPIRED',
        },
      });

      this.logger.log(`Marked ${expired.length} upload sessions as expired`);
    }
  }
}
