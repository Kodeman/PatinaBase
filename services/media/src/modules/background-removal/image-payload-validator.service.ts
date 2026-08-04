import { Injectable } from '@nestjs/common';
import * as fileType from 'file-type';
import {
  BackgroundRemovalSourceError,
  BackgroundRemovalVendorError,
} from './background-removal.errors';
import { ValidatedImage } from './background-removal.types';

const ALLOWED_IMAGES = new Map<string, ValidatedImage['extension']>([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/avif', 'avif'],
]);

function normalizeMime(value: string | undefined): string | null {
  if (!value) return null;
  const mime = value.split(';', 1)[0].trim().toLowerCase();
  return mime === 'image/jpg' ? 'image/jpeg' : mime;
}

@Injectable()
export class ImagePayloadValidatorService {
  async validateSource(
    bytes: Buffer,
    maxBytes: number,
    declaredMime?: string,
    requireDeclaredMime = false,
  ): Promise<ValidatedImage> {
    if (bytes.length === 0 || bytes.length > maxBytes) {
      throw new BackgroundRemovalSourceError();
    }

    const detected = await fileType.fromBuffer(bytes);
    const detectedMime = normalizeMime(detected?.mime);
    const declared = normalizeMime(declaredMime);
    const extension = detectedMime ? ALLOWED_IMAGES.get(detectedMime) : undefined;

    if (!detectedMime || !extension) {
      throw new BackgroundRemovalSourceError();
    }
    if (requireDeclaredMime && (!declared || !ALLOWED_IMAGES.has(declared))) {
      throw new BackgroundRemovalSourceError();
    }
    if (declared && ALLOWED_IMAGES.has(declared) && declared !== detectedMime) {
      throw new BackgroundRemovalSourceError();
    }

    return {
      bytes,
      mimeType: detectedMime as ValidatedImage['mimeType'],
      extension,
    };
  }

  async validateVendorOutput(bytes: Buffer, maxBytes: number): Promise<Buffer> {
    if (bytes.length === 0 || bytes.length > maxBytes) {
      throw new BackgroundRemovalVendorError();
    }
    const detected = await fileType.fromBuffer(bytes);
    if (detected?.mime !== 'image/png') {
      throw new BackgroundRemovalVendorError();
    }
    return bytes;
  }
}
