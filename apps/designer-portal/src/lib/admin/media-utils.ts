import { MediaType } from '@/types/media';

export const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
export const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB max

export const MIME_TYPES: Record<MediaType, string[]> = {
  image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
  video: ['video/mp4', 'video/webm', 'video/quicktime'],
  '3d': [
    'model/gltf-binary',
    'model/gltf+json',
    'model/obj',
    'model/stl',
    'application/octet-stream',
  ],
  document: ['application/pdf', 'application/msword', 'text/plain'],
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

// ============================
// IMAGE OPTIMIZATION HELPERS
// ============================

export interface ImageTransformOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'webp' | 'jpeg' | 'png' | 'avif';
  fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
  position?: 'center' | 'top' | 'bottom' | 'left' | 'right';
  blur?: number;
  sharpen?: boolean;
}

/**
 * Generate optimized image URL through media service or CDN
 * Supports Unsplash, media service, and CDN transformations
 */
export function getOptimizedImageUrl(
  url: string,
  options: ImageTransformOptions = {}
): string {
  if (!url) return '';

  // Check if it's an Unsplash URL - use their transformation API
  if (url.includes('unsplash.com')) {
    return getUnsplashOptimizedUrl(url, options);
  }

  // Check for CDN configuration
  const cdnUrl = process.env.NEXT_PUBLIC_CDN_URL;
  if (cdnUrl && url.startsWith(cdnUrl)) {
    return getCDNOptimizedUrl(url, options);
  }

  // Use media service transformation
  const mediaServiceUrl = process.env.NEXT_PUBLIC_MEDIA_SERVICE_URL || 'http://localhost:3006';
  return getMediaServiceOptimizedUrl(url, mediaServiceUrl, options);
}

/**
 * Optimize Unsplash images using their URL parameters
 */
function getUnsplashOptimizedUrl(url: string, options: ImageTransformOptions): string {
  const urlObj = new URL(url);
  const params = new URLSearchParams(urlObj.search);

  if (options.width) params.set('w', options.width.toString());
  if (options.height) params.set('h', options.height.toString());
  if (options.quality) params.set('q', options.quality.toString());
  if (options.fit) params.set('fit', options.fit);
  if (options.format) params.set('fm', options.format);
  if (options.blur) params.set('blur', options.blur.toString());

  // Auto format and compression
  if (!params.has('auto')) params.set('auto', 'format,compress');

  urlObj.search = params.toString();
  return urlObj.toString();
}

/**
 * Optimize images through CDN (e.g., Cloudflare Images, Imgix)
 */
function getCDNOptimizedUrl(url: string, options: ImageTransformOptions): string {
  const params = new URLSearchParams();

  if (options.width) params.set('width', options.width.toString());
  if (options.height) params.set('height', options.height.toString());
  if (options.quality) params.set('quality', options.quality.toString());
  if (options.format) params.set('format', options.format);
  if (options.fit) params.set('fit', options.fit);

  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${params.toString()}`;
}

/**
 * Optimize images through media service
 */
function getMediaServiceOptimizedUrl(
  url: string,
  mediaServiceUrl: string,
  options: ImageTransformOptions
): string {
  const params = new URLSearchParams();
  params.set('url', url);

  if (options.width) params.set('w', options.width.toString());
  if (options.height) params.set('h', options.height.toString());
  if (options.quality) params.set('q', options.quality.toString());
  if (options.format) params.set('f', options.format);
  if (options.fit) params.set('fit', options.fit);

  return `${mediaServiceUrl}/transform?${params.toString()}`;
}

/**
 * Generate responsive srcset for images
 */
export function generateSrcSet(url: string, sizes: number[] = [640, 750, 828, 1080, 1200, 1920]): string {
  return sizes
    .map((size) => {
      const optimizedUrl = getOptimizedImageUrl(url, { width: size, format: 'webp' });
      return `${optimizedUrl} ${size}w`;
    })
    .join(', ');
}

/**
 * Generate blur placeholder (low quality image placeholder - LQIP)
 */
export function getBlurPlaceholder(url: string): string {
  return getOptimizedImageUrl(url, {
    width: 20,
    quality: 20,
    blur: 10,
  });
}

/**
 * Get thumbnail version of image
 */
export function getThumbnailUrl(url: string, size: number = 300): string {
  return getOptimizedImageUrl(url, {
    width: size,
    height: size,
    fit: 'cover',
    quality: 80,
    format: 'webp',
  });
}

/**
 * Get responsive image props for Next.js Image component
 */
export function getResponsiveImageProps(
  url: string,
  alt: string,
  priority: boolean = false
) {
  return {
    src: getOptimizedImageUrl(url, { quality: 85, format: 'webp' }),
    alt,
    loading: priority ? 'eager' : ('lazy' as 'lazy' | 'eager'),
    placeholder: 'blur' as 'blur' | 'empty',
    blurDataURL: getBlurPlaceholder(url),
  };
}

/**
 * Preload critical images
 */
export function preloadImage(url: string, options: ImageTransformOptions = {}): void {
  if (typeof window === 'undefined') return;

  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'image';
  link.href = getOptimizedImageUrl(url, options);

  // Add responsive srcset if width is specified
  if (options.width) {
    link.setAttribute('imagesrcset', generateSrcSet(url));
    link.setAttribute('imagesizes', `${options.width}px`);
  }

  document.head.appendChild(link);
}

/**
 * Check if browser supports WebP
 */
export function supportsWebP(): boolean {
  if (typeof window === 'undefined') return false;

  const elem = document.createElement('canvas');
  if (elem.getContext && elem.getContext('2d')) {
    return elem.toDataURL('image/webp').indexOf('data:image/webp') === 0;
  }
  return false;
}

/**
 * Get image format based on browser support
 */
export function getOptimalFormat(): 'webp' | 'jpeg' {
  return supportsWebP() ? 'webp' : 'jpeg';
}
