import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AxiosRequestConfig } from 'axios';

export interface UploadUrlRequest {
  projectId: string;
  category: string;
  filename: string;
  mimeType?: string;
  fileSize?: number;
}

export interface UploadUrlResponse {
  uploadUrl: string;
  key: string;
  assetId: string;
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
  async getUploadUrl(request: UploadUrlRequest, token?: string): Promise<UploadUrlResponse> {
    try {
      const config: AxiosRequestConfig = {
        headers: {
          'Content-Type': 'application/json',
        },
      };

      if (token) {
        config.headers!['Authorization'] = `Bearer ${token}`;
      }

      const response = await firstValueFrom(
        this.httpService.post<UploadUrlResponse>(
          `${this.baseUrl}/upload/presigned`,
          {
            kind: 'DOCUMENT',
            filename: request.filename,
            fileSize: request.fileSize,
            mimeType: request.mimeType,
            metadata: {
              projectId: request.projectId,
              category: request.category,
            },
            role: 'DOCUMENT',
          },
          config,
        ),
      );

      const data = (response as any)?.data || response;
      return {
        uploadUrl: data.uploadUrl || data.parUrl, // Handle different response formats
        key: data.key || data.targetKey,
        assetId: data.assetId,
        expiresAt: new Date(data.expiresAt),
        headers: data.headers,
      };
    } catch (error) {
      this.logger.error('Failed to get upload URL:', error);
      throw error;
    }
  }

  /**
   * Get pre-signed URL for downloading a document
   */
  async getDownloadUrl(key: string, token?: string): Promise<DownloadUrlResponse> {
    try {
      const config: AxiosRequestConfig = {
        headers: {
          'Content-Type': 'application/json',
        },
      };

      if (token) {
        config.headers!['Authorization'] = `Bearer ${token}`;
      }

      const response = await firstValueFrom(
        this.httpService.get<DownloadUrlResponse>(
          `${this.baseUrl}/download/presigned/${encodeURIComponent(key)}`,
          config,
        ),
      );

      const data = (response as any)?.data || response;
      return {
        downloadUrl: data.downloadUrl,
        expiresIn: data.expiresIn || 3600, // Default 1 hour
      };
    } catch (error) {
      this.logger.error(`Failed to get download URL for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Delete a media asset
   */
  async deleteAsset(assetId: string, token?: string): Promise<void> {
    try {
      const config: AxiosRequestConfig = {
        headers: {
          'Content-Type': 'application/json',
        },
      };

      if (token) {
        config.headers!['Authorization'] = `Bearer ${token}`;
      }

      await firstValueFrom(
        this.httpService.delete(`${this.baseUrl}/assets/${assetId}`, config),
      );

      this.logger.log(`Deleted media asset ${assetId}`);
    } catch (error) {
      this.logger.error(`Failed to delete asset ${assetId}:`, error);
      throw error;
    }
  }

  /**
   * Get media asset details
   */
  async getAsset(assetId: string, token?: string): Promise<MediaAsset | null> {
    try {
      const config: AxiosRequestConfig = {
        headers: {
          'Content-Type': 'application/json',
        },
      };

      if (token) {
        config.headers!['Authorization'] = `Bearer ${token}`;
      }

      const response = await firstValueFrom(
        this.httpService.get<MediaAsset>(`${this.baseUrl}/assets/${assetId}`, config),
      );

      return (response as any)?.data || response;
    } catch (error) {
      this.logger.error(`Failed to get asset ${assetId}:`, error);
      return null;
    }
  }

  /**
   * Get multiple media assets
   */
  async getAssets(assetIds: string[], token?: string): Promise<MediaAsset[]> {
    try {
      const config: AxiosRequestConfig = {
        headers: {
          'Content-Type': 'application/json',
        },
        params: {
          ids: assetIds.join(','),
        },
      };

      if (token) {
        config.headers!['Authorization'] = `Bearer ${token}`;
      }

      const response = await firstValueFrom(
        this.httpService.get<MediaAsset[]>(`${this.baseUrl}/assets`, config),
      );

      return (response as any)?.data || response;
    } catch (error) {
      this.logger.error('Failed to get assets:', error);
      return [];
    }
  }

  /**
   * Process media asset (e.g., generate thumbnails, extract metadata)
   */
  async processAsset(assetId: string, operations?: string[], token?: string): Promise<void> {
    try {
      const config: AxiosRequestConfig = {
        headers: {
          'Content-Type': 'application/json',
        },
      };

      if (token) {
        config.headers!['Authorization'] = `Bearer ${token}`;
      }

      await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/assets/${assetId}/process`,
          {
            operations: operations || ['thumbnail', 'metadata'],
          },
          config,
        ),
      );

      this.logger.log(`Triggered processing for asset ${assetId}`);
    } catch (error) {
      this.logger.error(`Failed to process asset ${assetId}:`, error);
      // Don't throw - processing is often async and non-critical
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
  validateFile(filename: string, mimeType: string, fileSize: number): { valid: boolean; error?: string } {
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
}