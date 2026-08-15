import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import * as mime from 'mime-types';
import { v4 as uuidv4 } from 'uuid';
import { AssetKind, AssetRole } from '../../generated/prisma-client';
import { MediaAuthorizationResolver } from '../authorization/media-authorization.resolver';
import { OCIStorageService } from '../storage/oci-storage.service';

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
  private readonly ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
  private readonly ALLOWED_3D_MIMES = [
    'model/gltf-binary',
    'model/gltf+json',
    'model/vnd.usdz+zip',
    'application/octet-stream',
  ];
  private readonly MAX_IMAGE_SIZE = 50 * 1024 * 1024;
  private readonly MAX_3D_SIZE = 500 * 1024 * 1024;
  private readonly PAR_TTL_MINUTES = 15;

  constructor(
    private readonly ociStorage: OCIStorageService,
    private readonly config: ConfigService,
    private readonly authorization: MediaAuthorizationResolver,
  ) {}

  async createUploadIntent(
    subject: string,
    intent: UploadIntent,
    idempotencyKey?: string,
  ): Promise<UploadResponse> {
    const normalized = this.normalizeIntent(intent);
    const actorKey = idempotencyKey
      ? createHash('sha256').update(subject).update('\0').update(idempotencyKey).digest('hex')
      : undefined;

    return this.authorization.withAssetScope(subject, 'manage', async (transaction, scope) => {
      await this.authorization.requireProduct(
        transaction,
        scope,
        normalized.productId,
        normalized.variantId,
      );

      if (actorKey) {
        const existing = await transaction.uploadSession.findUnique({
          where: { idempotencyKey: actorKey },
        });
        if (existing) {
          if (
            existing.userId !== subject ||
            existing.filename !== normalized.filename ||
            existing.mimeType !== normalized.mimeType ||
            existing.fileSize !== (normalized.fileSize ?? null) ||
            existing.productId !== (normalized.productId ?? null) ||
            existing.variantId !== (normalized.variantId ?? null) ||
            existing.kind !== normalized.kind ||
            existing.role !== (normalized.role ?? null)
          ) {
            throw new ConflictException('Idempotency key was already used');
          }
          await this.authorization.requireAsset(transaction, scope, existing.assetId ?? '');
          return {
            assetId: existing.assetId as string,
            uploadSessionId: existing.id,
            parUrl: existing.parUrl,
            targetKey: existing.targetKey,
            headers: this.getUploadHeaders(normalized.mimeType),
            expiresAt: existing.expiresAt,
          };
        }
      }

      const assetId = uuidv4();
      const targetKey = this.ociStorage.generateObjectKey(
        assetId,
        normalized.kind === AssetKind.IMAGE ? 'image' : '3d',
        normalized.filename,
      );
      const expiresAt = new Date(Date.now() + this.PAR_TTL_MINUTES * 60 * 1000);
      const rawBucket = this.config.get<string>('OCI_BUCKET_RAW');
      if (!rawBucket) throw new BadRequestException('Media upload is unavailable');
      const par = await this.ociStorage.createPAR({
        bucketName: rawBucket,
        objectName: targetKey,
        accessType: 'ObjectWrite',
        timeExpires: expiresAt,
      });

      await transaction.mediaAsset.create({
        data: {
          id: assetId,
          kind: normalized.kind,
          productId: normalized.productId,
          variantId: normalized.variantId,
          role: normalized.role,
          rawKey: targetKey,
          status: 'PENDING',
          uploadedBy: subject,
          mimeType: normalized.mimeType,
          sizeBytes: normalized.fileSize,
        },
      });
      const session = await transaction.uploadSession.create({
        data: {
          assetId,
          filename: normalized.filename,
          fileSize: normalized.fileSize,
          mimeType: normalized.mimeType,
          kind: normalized.kind,
          parUrl: par.fullUrl,
          targetKey,
          expiresAt,
          status: 'PENDING',
          userId: subject,
          productId: normalized.productId,
          variantId: normalized.variantId,
          role: normalized.role,
          idempotencyKey: actorKey,
        },
      });
      return {
        assetId,
        uploadSessionId: session.id,
        parUrl: par.fullUrl,
        targetKey,
        headers: this.getUploadHeaders(normalized.mimeType),
        expiresAt,
      };
    });
  }

  async confirmUpload(
    subject: string,
    routeSessionId: string,
    bodySessionId?: string,
  ): Promise<{ assetId: string; targetKey: string }> {
    if (bodySessionId !== undefined && bodySessionId !== routeSessionId) {
      throw new BadRequestException('Upload session does not match route');
    }
    return this.authorization.withAssetScope(subject, 'manage', async (transaction, scope) => {
      const session = await transaction.uploadSession.findFirst({
        where: { id: routeSessionId, userId: subject },
      });
      if (!session?.assetId) throw this.authorization.notFound();
      const asset = await this.authorization.requireAsset(transaction, scope, session.assetId);
      if (session.status === 'UPLOADED') {
        return { assetId: asset.id, targetKey: session.targetKey };
      }
      if (session.status !== 'PENDING' || session.expiresAt.getTime() <= Date.now()) {
        throw new BadRequestException('Upload session is not confirmable');
      }

      const rawBucket = this.config.get<string>('OCI_BUCKET_RAW');
      if (!rawBucket) throw new BadRequestException('Media upload is unavailable');
      const uploaded = await this.ociStorage.headObject(rawBucket, session.targetKey);
      if (
        (session.fileSize !== null && uploaded.sizeBytes !== session.fileSize) ||
        (uploaded.contentType && uploaded.contentType !== session.mimeType)
      ) {
        throw new BadRequestException('Uploaded object does not match the upload intent');
      }

      await transaction.uploadSession.update({
        where: { id: session.id },
        data: { status: 'UPLOADED', uploadedAt: new Date() },
      });
      await transaction.mediaAsset.update({
        where: { id: asset.id },
        data: { rawKey: session.targetKey },
      });
      return { assetId: asset.id, targetKey: session.targetKey };
    });
  }

  private normalizeIntent(
    intent: UploadIntent,
  ): Required<Pick<UploadIntent, 'kind' | 'filename'>> &
    Omit<UploadIntent, 'kind' | 'filename' | 'mimeType'> & { mimeType: string } {
    if (!intent.filename || intent.filename.length > 255) {
      throw new BadRequestException('Invalid filename');
    }
    if (!Object.values(AssetKind).includes(intent.kind)) {
      throw new BadRequestException('Invalid media kind');
    }
    const mimeType = intent.mimeType || mime.lookup(intent.filename) || 'application/octet-stream';
    const allowed =
      intent.kind === AssetKind.IMAGE ? this.ALLOWED_IMAGE_MIMES : this.ALLOWED_3D_MIMES;
    if (!allowed.includes(mimeType)) throw new BadRequestException('Invalid media MIME type');
    const maximum = intent.kind === AssetKind.IMAGE ? this.MAX_IMAGE_SIZE : this.MAX_3D_SIZE;
    if (intent.fileSize !== undefined && (intent.fileSize < 0 || intent.fileSize > maximum)) {
      throw new BadRequestException('Invalid media file size');
    }
    if (intent.role === AssetRole.HERO && intent.kind !== AssetKind.IMAGE) {
      throw new BadRequestException('HERO role is only valid for images');
    }
    return { ...intent, filename: intent.filename, mimeType };
  }

  private getUploadHeaders(mimeType: string): Record<string, string> {
    return { 'x-content-type': mimeType };
  }
}
