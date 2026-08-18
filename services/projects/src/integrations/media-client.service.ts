import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AxiosRequestConfig } from 'axios';

export interface UploadUrlRequest {
  publicProjectId: string;
  category: string;
  filename: string;
  mimeType?: string;
  fileSize?: number;
}

export interface UploadUrlResponse {
  uploadUrl: string;
  key: string;
  assetId: string;
  uploadSessionId: string;
  expiresAt: Date;
  headers?: Record<string, string>;
}

export interface DownloadUrlResponse {
  downloadUrl: string;
  expiresIn: number;
}

export interface MediaAsset {
  id: string;
  key: string;
  url?: string;
  mimeType: string;
  sizeBytes: number;
  metadata?: any;
  thumbnailUrl?: string;
  status: string;
  createdAt: Date;
}

@Injectable()
export class MediaClientService {
  private readonly logger = new Logger(MediaClientService.name);
  private readonly baseUrl: string;

  constructor(
    private httpService: HttpService,
    private configService: ConfigService,
  ) {
    this.baseUrl = this.configService.get<string>('MEDIA_SERVICE_URL', 'http://localhost:3014');
  }

  /**
   * Get pre-signed URL for uploading a document
   */
  async getUploadUrl(
    request: UploadUrlRequest,
    authorization: string,
    idempotencyKey: string,
  ): Promise<UploadUrlResponse> {
    try {
      const config = this.delegatedConfig(authorization);
      config.headers!['Idempotency-Key'] = idempotencyKey;

      const response = await firstValueFrom(
        this.httpService.post<UploadUrlResponse>(
          `${this.baseUrl}/v1/media/upload`,
          {
            kind: request.mimeType?.startsWith('image/') ? 'IMAGE' : 'DOCUMENT',
            filename: request.filename,
            fileSize: request.fileSize,
            mimeType: request.mimeType,
            projectId: request.publicProjectId,
          },
          config,
        ),
      );

      const data = (response as any)?.data || response;
      return {
        uploadUrl: data.parUrl,
        key: data.targetKey,
        assetId: data.assetId,
        uploadSessionId: data.uploadSessionId,
        expiresAt: new Date(data.expiresAt),
        headers: data.headers,
      };
    } catch (error) {
      this.logger.error('Failed to get upload URL');
      throw error;
    }
  }

  async confirmUpload(sessionId: string, authorization: string): Promise<void> {
    const config = this.delegatedConfig(authorization);
    await firstValueFrom(
      this.httpService.post(
        `${this.baseUrl}/v1/media/upload/${encodeURIComponent(sessionId)}/confirm`,
        { sessionId },
        config,
      ),
    );
  }

  /**
   * Get pre-signed URL for downloading a document
   */
  async getDownloadUrl(assetId: string, authorization: string): Promise<DownloadUrlResponse> {
    try {
      const config = this.delegatedConfig(authorization);

      const response = await firstValueFrom(
        this.httpService.get<DownloadUrlResponse>(
          `${this.baseUrl}/v1/media/${encodeURIComponent(assetId)}/download`,
          config,
        ),
      );

      const data = (response as any)?.data || response;
      return {
        downloadUrl: data.downloadUrl,
        expiresIn: data.expiresAt
          ? Math.max(0, Math.floor((new Date(data.expiresAt).getTime() - Date.now()) / 1000))
          : 3600,
      };
    } catch (error) {
      this.logger.error('Failed to get download URL');
      throw error;
    }
  }

  /**
   * Delete a media asset
   */
  async deleteAsset(assetId: string, authorization: string): Promise<void> {
    try {
      const config = this.delegatedConfig(authorization);

      await firstValueFrom(
        this.httpService.delete(`${this.baseUrl}/v1/media/${encodeURIComponent(assetId)}`, config),
      );

      this.logger.log('Deleted media asset');
    } catch (error) {
      this.logger.error('Failed to delete media asset');
      throw error;
    }
  }

  /**
   * Get media asset details
   */
  async getAsset(assetId: string, authorization: string): Promise<MediaAsset> {
    try {
      const config = this.delegatedConfig(authorization);

      const response = await firstValueFrom(
        this.httpService.get<MediaAsset>(
          `${this.baseUrl}/v1/media/${encodeURIComponent(assetId)}`,
          config,
        ),
      );

      return (response as any)?.data || response;
    } catch (error) {
      this.logger.error('Failed to get media asset');
      throw error;
    }
  }

  /**
   * Get multiple media assets
   */
  async getAssets(assetIds: string[], authorization: string): Promise<MediaAsset[]> {
    return Promise.all(assetIds.map((assetId) => this.getAsset(assetId, authorization)));
  }

  /**
   * Process media asset (e.g., generate thumbnails, extract metadata)
   */
  async processAsset(assetId: string, authorization: string, operations?: string[]): Promise<void> {
    try {
      const config = this.delegatedConfig(authorization);

      await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/v1/media/${encodeURIComponent(assetId)}/process`,
          {
            operations: operations || ['thumbnail', 'metadata'],
          },
          config,
        ),
      );

      this.logger.log('Triggered media processing');
    } catch (error) {
      this.logger.error('Failed to process media asset');
      throw error;
    }
  }

  /**
   * Get CDN URL for an asset
   */
  getCdnUrl(key: string): string {
    const cdnDomain = this.configService.get<string>('CDN_DOMAIN', 'cdn.patina.io');
    return `https://${cdnDomain}/${key}`;
  }

  /**
   * Validate file type and size
   */
  validateFile(
    filename: string,
    mimeType: string,
    fileSize: number,
  ): { valid: boolean; error?: string } {
    const ALLOWED_DOCUMENT_TYPES = [
      'application/pdf',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'image/webp',
    ];

    const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

    if (!ALLOWED_DOCUMENT_TYPES.includes(mimeType)) {
      return {
        valid: false,
        error: `File type ${mimeType} is not allowed`,
      };
    }

    if (fileSize > MAX_FILE_SIZE) {
      return {
        valid: false,
        error: `File size ${fileSize} exceeds maximum of ${MAX_FILE_SIZE} bytes`,
      };
    }

    return { valid: true };
  }

  private delegatedConfig(authorization: string): AxiosRequestConfig {
    if (!/^Bearer\s+\S+$/i.test(authorization?.trim())) {
      throw new UnauthorizedException('A verified delegated identity is required');
    }
    return {
      headers: {
        'Content-Type': 'application/json',
        Authorization: authorization.trim(),
      },
    };
  }
}
