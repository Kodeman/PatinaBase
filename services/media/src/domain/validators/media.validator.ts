/**
 * Media Validator
 * Encapsulates all media validation business rules
 * Pure domain logic with no external dependencies
 */

import { Injectable, BadRequestException } from '@nestjs/common';

export interface FileValidationOptions {
  kind: 'IMAGE' | 'VIDEO' | 'MODEL3D';
  mimeType?: string;
  fileSize?: number;
  filename?: string;
}

export interface ValidationIssue {
  code: string;
  severity: 'error' | 'warning' | 'info';
  field?: string;
  message: string;
  meta?: Record<string, any>;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  hasErrors: boolean;
  hasWarnings: boolean;
}

@Injectable()
export class MediaValidator {
  // File size limits (in bytes)
  private readonly MAX_IMAGE_SIZE = 50 * 1024 * 1024; // 50MB
  private readonly MAX_VIDEO_SIZE = 500 * 1024 * 1024; // 500MB
  private readonly MAX_3D_SIZE = 500 * 1024 * 1024; // 500MB

  // Allowed MIME types
  private readonly ALLOWED_IMAGE_TYPES = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/avif',
    'image/heic',
  ];

  private readonly ALLOWED_VIDEO_TYPES = [
    'video/mp4',
    'video/webm',
    'video/quicktime',
  ];

  private readonly ALLOWED_3D_TYPES = [
    'model/gltf-binary',
    'model/gltf+json',
    'model/vnd.usdz+zip',
    'application/octet-stream', // For GLB/USDZ
  ];

  /**
   * Validate file upload
   * Throws BadRequestException if validation fails
   */
  validateFileUpload(options: FileValidationOptions): void {
    const { kind, mimeType, fileSize, filename } = options;

    // Validate file size
    if (fileSize !== undefined) {
      this.validateFileSize(kind, fileSize);
    }

    // Validate MIME type
    if (mimeType) {
      this.validateMimeType(kind, mimeType);
    }

    // Validate filename
    if (filename) {
      this.validateFilename(filename);
    }
  }

  /**
   * Validate file size based on media kind
   */
  private validateFileSize(kind: string, fileSize: number): void {
    let maxSize: number;

    switch (kind) {
      case 'IMAGE':
        maxSize = this.MAX_IMAGE_SIZE;
        break;
      case 'VIDEO':
        maxSize = this.MAX_VIDEO_SIZE;
        break;
      case 'MODEL3D':
        maxSize = this.MAX_3D_SIZE;
        break;
      default:
        throw new BadRequestException('Invalid media kind');
    }

    if (fileSize > maxSize) {
      throw new BadRequestException(
        `File size exceeds maximum allowed (${this.formatBytes(maxSize)} for ${kind})`,
      );
    }

    if (fileSize <= 0) {
      throw new BadRequestException('File size must be greater than 0');
    }
  }

  /**
   * Validate MIME type based on media kind
   */
  private validateMimeType(kind: string, mimeType: string): void {
    let allowedTypes: string[];

    switch (kind) {
      case 'IMAGE':
        allowedTypes = this.ALLOWED_IMAGE_TYPES;
        break;
      case 'VIDEO':
        allowedTypes = this.ALLOWED_VIDEO_TYPES;
        break;
      case 'MODEL3D':
        allowedTypes = this.ALLOWED_3D_TYPES;
        break;
      default:
        throw new BadRequestException('Invalid media kind');
    }

    if (!allowedTypes.includes(mimeType)) {
      throw new BadRequestException(
        `Invalid MIME type for ${kind}. Allowed: ${allowedTypes.join(', ')}`,
      );
    }
  }

  /**
   * Validate filename
   */
  private validateFilename(filename: string): void {
    if (!filename || filename.trim().length === 0) {
      throw new BadRequestException('Filename cannot be empty');
    }

    if (filename.length > 255) {
      throw new BadRequestException('Filename too long (max 255 characters)');
    }

    // Check for dangerous characters
    const dangerousChars = /[<>:"|?*\x00-\x1f]/;
    if (dangerousChars.test(filename)) {
      throw new BadRequestException('Filename contains invalid characters');
    }
  }

  /**
   * Validate image dimensions
   */
  validateImageDimensions(
    width: number,
    height: number,
    role?: string,
  ): ValidationResult {
    const issues: ValidationIssue[] = [];
    const shortEdge = Math.min(width, height);
    const aspectRatio = width / height;

    // Validate basic dimensions
    if (width <= 0 || height <= 0) {
      issues.push({
        code: 'INVALID_DIMENSIONS',
        severity: 'error',
        message: 'Width and height must be greater than 0',
        meta: { width, height },
      });
    }

    // Validate minimum dimensions for hero images
    if (role === 'HERO' && shortEdge < 1600) {
      issues.push({
        code: 'HERO_MIN_SIZE',
        severity: 'error',
        field: 'dimensions',
        message: `Hero images must have shortest edge >= 1600px (current: ${shortEdge}px)`,
        meta: { width, height, shortEdge, required: 1600 },
      });
    }

    // Validate minimum dimensions for angle images
    if (role === 'ANGLE' && shortEdge < 1200) {
      issues.push({
        code: 'ANGLE_MIN_SIZE',
        severity: 'error',
        field: 'dimensions',
        message: `Angle images must have shortest edge >= 1200px (current: ${shortEdge}px)`,
        meta: { width, height, shortEdge, required: 1200 },
      });
    }

    // Validate aspect ratio
    if (aspectRatio < 4 / 3 || aspectRatio > 16 / 9) {
      issues.push({
        code: 'INVALID_ASPECT_RATIO',
        severity: 'warning',
        field: 'aspectRatio',
        message: `Aspect ratio ${aspectRatio.toFixed(2)}:1 outside recommended range (4:3 to 16:9)`,
        meta: { aspectRatio, minRatio: 4 / 3, maxRatio: 16 / 9 },
      });
    }

    // Warn about very large dimensions (performance concern)
    if (width > 8000 || height > 8000) {
      issues.push({
        code: 'VERY_LARGE_DIMENSIONS',
        severity: 'warning',
        field: 'dimensions',
        message: 'Image dimensions are very large and may impact performance',
        meta: { width, height },
      });
    }

    return {
      valid: !issues.some((i) => i.severity === 'error'),
      issues,
      hasErrors: issues.some((i) => i.severity === 'error'),
      hasWarnings: issues.some((i) => i.severity === 'warning'),
    };
  }

  /**
   * Validate role assignment
   */
  validateRole(kind: string, role?: string): void {
    if (!role) return;

    const validImageRoles = ['HERO', 'ANGLE', 'LIFESTYLE', 'DETAIL', 'AR_PREVIEW', 'TEXTURE', 'OTHER'];
    const valid3DRoles = ['AR_PREVIEW', 'TEXTURE', 'OTHER'];

    if (kind === 'IMAGE' && !validImageRoles.includes(role)) {
      throw new BadRequestException(
        `Invalid role for IMAGE. Allowed: ${validImageRoles.join(', ')}`,
      );
    }

    if (kind === 'MODEL3D' && !valid3DRoles.includes(role)) {
      throw new BadRequestException(
        `Invalid role for MODEL3D. Allowed: ${valid3DRoles.join(', ')}`,
      );
    }

    // HERO role only valid for images
    if (role === 'HERO' && kind !== 'IMAGE') {
      throw new BadRequestException('HERO role only valid for images');
    }
  }

  /**
   * Validate tags
   */
  validateTags(tags: string[]): ValidationResult {
    const issues: ValidationIssue[] = [];

    if (tags.length > 50) {
      issues.push({
        code: 'TOO_MANY_TAGS',
        severity: 'error',
        field: 'tags',
        message: 'Maximum 50 tags allowed',
        meta: { count: tags.length, max: 50 },
      });
    }

    // Check individual tag length
    tags.forEach((tag, index) => {
      if (tag.length > 100) {
        issues.push({
          code: 'TAG_TOO_LONG',
          severity: 'error',
          field: `tags[${index}]`,
          message: `Tag "${tag}" exceeds maximum length of 100 characters`,
          meta: { tag, length: tag.length },
        });
      }

      if (tag.trim().length === 0) {
        issues.push({
          code: 'EMPTY_TAG',
          severity: 'error',
          field: `tags[${index}]`,
          message: 'Tags cannot be empty',
        });
      }
    });

    // Warn about duplicate tags
    const uniqueTags = new Set(tags.map((t) => t.toLowerCase()));
    if (uniqueTags.size < tags.length) {
      issues.push({
        code: 'DUPLICATE_TAGS',
        severity: 'warning',
        field: 'tags',
        message: 'Duplicate tags detected (case-insensitive)',
        meta: { original: tags.length, unique: uniqueTags.size },
      });
    }

    return {
      valid: !issues.some((i) => i.severity === 'error'),
      issues,
      hasErrors: issues.some((i) => i.severity === 'error'),
      hasWarnings: issues.some((i) => i.severity === 'warning'),
    };
  }

  /**
   * Format bytes to human-readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Get max file size for a media kind
   */
  getMaxFileSize(kind: string): number {
    switch (kind) {
      case 'IMAGE':
        return this.MAX_IMAGE_SIZE;
      case 'VIDEO':
        return this.MAX_VIDEO_SIZE;
      case 'MODEL3D':
        return this.MAX_3D_SIZE;
      default:
        throw new BadRequestException('Invalid media kind');
    }
  }

  /**
   * Get allowed MIME types for a media kind
   */
  getAllowedMimeTypes(kind: string): string[] {
    switch (kind) {
      case 'IMAGE':
        return [...this.ALLOWED_IMAGE_TYPES];
      case 'VIDEO':
        return [...this.ALLOWED_VIDEO_TYPES];
      case 'MODEL3D':
        return [...this.ALLOWED_3D_TYPES];
      default:
        throw new BadRequestException('Invalid media kind');
    }
  }
}
