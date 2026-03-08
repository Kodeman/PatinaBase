import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import * as fileType from 'file-type';
import { createHash } from 'crypto';

export interface FileValidationOptions {
  maxSize?: number;
  allowedMimeTypes?: string[];
  allowedExtensions?: string[];
  requireChecksum?: boolean;
}

/**
 * Custom file validation pipe with advanced checks
 */
@Injectable()
export class FileValidationPipe implements PipeTransform {
  constructor(private readonly options: FileValidationOptions = {}) {}

  async transform(file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    // Validate file size
    if (this.options.maxSize && file.size > this.options.maxSize) {
      throw new BadRequestException(
        `File size exceeds maximum allowed (${this.options.maxSize} bytes)`,
      );
    }

    // Validate MIME type from file buffer (more secure than trusting client)
    if (this.options.allowedMimeTypes) {
      const detectedType = await fileType.fromBuffer(file.buffer);

      if (!detectedType) {
        throw new BadRequestException('Unable to determine file type');
      }

      if (!this.options.allowedMimeTypes.includes(detectedType.mime)) {
        throw new BadRequestException(
          `Invalid file type. Allowed types: ${this.options.allowedMimeTypes.join(', ')}`,
        );
      }

      // Update file mime type to detected type
      file.mimetype = detectedType.mime;
    }

    // Validate file extension
    if (this.options.allowedExtensions) {
      const extension = file.originalname.split('.').pop()?.toLowerCase();

      if (!extension || !this.options.allowedExtensions.includes(extension)) {
        throw new BadRequestException(
          `Invalid file extension. Allowed extensions: ${this.options.allowedExtensions.join(', ')}`,
        );
      }
    }

    // Generate checksum if required
    if (this.options.requireChecksum) {
      const checksum = createHash('sha256').update(file.buffer).digest('hex');
      (file as any).checksum = checksum;
    }

    return file;
  }
}
