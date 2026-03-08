import { MediaType } from '@/types/media';

export const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
export const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB max

export const MIME_TYPES: Record<MediaType, string[]> = {
  // SVG removed from allowed types due to XSS risk - use sanitized SVG upload endpoint instead
  image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  video: ['video/mp4', 'video/webm'],
  '3d': [
    'model/gltf-binary',
    'model/gltf+json',
  ],
  document: ['application/pdf'],
};

export function getMediaType(mimeType: string): MediaType {
  for (const [type, mimes] of Object.entries(MIME_TYPES)) {
    if (mimes.includes(mimeType)) {
      return type as MediaType;
    }
  }
  return 'document';
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

export function getFileExtension(filename: string): string {
  return filename.slice(((filename.lastIndexOf('.') - 1) >>> 0) + 2);
}

/**
 * Basic file validation - checks MIME type and size only
 * For production use, call validateFileSecure() from @/lib/security/file-validation
 *
 * @deprecated Use validateFileSecure() for secure validation with magic number checking
 */
export function validateFile(file: File): { valid: boolean; error?: string } {
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File size exceeds ${formatFileSize(MAX_FILE_SIZE)} limit`,
    };
  }

  const mediaType = getMediaType(file.type);
  const allowedMimes = MIME_TYPES[mediaType];

  if (!allowedMimes.includes(file.type)) {
    return {
      valid: false,
      error: `File type ${file.type} is not supported`,
    };
  }

  // Security note: This only checks browser-provided MIME type
  // For production, use validateFileSecure() which includes magic number verification
  console.warn('Using basic validateFile(). Consider using validateFileSecure() for enhanced security.');

  return { valid: true };
}

export async function generateThumbnail(
  file: File,
  maxWidth: number = 300,
  maxHeight: number = 300
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        const ratio = Math.min(maxWidth / img.width, maxHeight / img.height);
        canvas.width = img.width * ratio;
        canvas.height = img.height * ratio;

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };

    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function createChunks(file: File, chunkSize: number = CHUNK_SIZE): Blob[] {
  const chunks: Blob[] = [];
  let offset = 0;

  while (offset < file.size) {
    const chunk = file.slice(offset, offset + chunkSize);
    chunks.push(chunk);
    offset += chunkSize;
  }

  return chunks;
}

export async function calculateFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function getImageDimensions(
  file: File
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.width, height: img.height });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}

export function isImageFile(mimeType: string): boolean {
  return MIME_TYPES.image.includes(mimeType);
}

export function isVideoFile(mimeType: string): boolean {
  return MIME_TYPES.video.includes(mimeType);
}

export function is3DFile(mimeType: string): boolean {
  return MIME_TYPES['3d'].includes(mimeType);
}

export async function extractVideoMetadata(
  file: File
): Promise<{ duration: number; dimensions: { width: number; height: number } }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);

    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve({
        duration: video.duration,
        dimensions: {
          width: video.videoWidth,
          height: video.videoHeight,
        },
      });
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load video metadata'));
    };

    video.src = url;
  });
}

export function getAcceptString(types?: MediaType[]): string {
  if (!types || types.length === 0) {
    return Object.values(MIME_TYPES).flat().join(',');
  }

  return types.map((type) => MIME_TYPES[type]).flat().join(',');
}
