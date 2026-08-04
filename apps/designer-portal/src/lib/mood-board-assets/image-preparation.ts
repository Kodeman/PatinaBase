export const BOARD_IMAGE_DISPLAY_MAX_EDGE = 2400;
export const BOARD_IMAGE_THUMBNAIL_MAX_EDGE = 400;

const DISPLAY_QUALITY = 0.9;
const THUMBNAIL_QUALITY = 0.82;

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface DecodedBoardImage extends ImageDimensions {
  source: CanvasImageSource;
  dispose?: () => void;
}

export interface BrowserImagePreparationRuntime {
  decode(
    file: File,
    options: { imageOrientation: 'from-image' },
  ): Promise<DecodedBoardImage>;
  supportsWebP(): Promise<boolean>;
  encode(
    source: CanvasImageSource,
    dimensions: ImageDimensions,
    mimeType: 'image/webp' | 'image/jpeg',
    quality: number,
  ): Promise<Blob>;
}

export interface PreparedBoardImageVariant extends ImageDimensions {
  file: File;
  mimeType: 'image/webp' | 'image/jpeg';
  extension: 'webp' | 'jpg';
}

export interface PreparedBoardImage {
  assetId: string;
  aspectRatio: number;
  original: {
    name: string;
    mimeType: string;
    byteSize: number;
    width: number;
    height: number;
  };
  display: PreparedBoardImageVariant;
  thumbnail: PreparedBoardImageVariant;
}

export interface PrepareBoardImageOptions {
  assetId: string;
  runtime?: BrowserImagePreparationRuntime;
  displayMaxEdge?: number;
  thumbnailMaxEdge?: number;
}

function positiveDimension(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number`);
  }
}

export function containImageDimensions(
  width: number,
  height: number,
  maxEdge: number,
): ImageDimensions {
  positiveDimension(width, 'Image width');
  positiveDimension(height, 'Image height');
  positiveDimension(maxEdge, 'Maximum edge');

  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function assertAssetId(assetId: string): void {
  if (!/^[A-Za-z0-9_-]+$/.test(assetId)) {
    throw new Error('Asset ID must be a safe storage-path segment');
  }
}

function fileNames(assetId: string, extension: 'webp' | 'jpg') {
  return {
    display: `${assetId}.${extension}`,
    thumbnail: `${assetId}-thumb.${extension}`,
  };
}

function canvasBlob(
  canvas: HTMLCanvasElement,
  mimeType: 'image/webp' | 'image/jpeg',
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob || blob.type !== mimeType) {
          reject(new Error(`The browser could not encode ${mimeType}`));
          return;
        }
        resolve(blob);
      },
      mimeType,
      quality,
    );
  });
}

function decodeWithImageElement(file: File): Promise<DecodedBoardImage> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      resolve({
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        dispose: () => URL.revokeObjectURL(objectUrl),
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('The image could not be decoded'));
    };
    // Modern browser image decoders honor EXIF orientation for image elements.
    image.src = objectUrl;
  });
}

export const browserImagePreparationRuntime: BrowserImagePreparationRuntime = {
  async decode(file, options) {
    if (typeof createImageBitmap === 'function') {
      try {
        const bitmap = await createImageBitmap(file, options);
        return {
          source: bitmap,
          width: bitmap.width,
          height: bitmap.height,
          dispose: () => bitmap.close(),
        };
      } catch {
        // Safari/image-format gaps fall through to the orientation-aware image
        // element decoder instead of sending the undecoded original to storage.
      }
    }
    return decodeWithImageElement(file);
  },

  async supportsWebP() {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      return canvas.toDataURL('image/webp').startsWith('data:image/webp');
    } catch {
      return false;
    }
  },

  async encode(source, dimensions, mimeType, quality) {
    const canvas = document.createElement('canvas');
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('The browser could not create an image canvas');
    if (mimeType === 'image/jpeg') {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvasBlob(canvas, mimeType, quality);
  },
};

async function encodeVariants(
  decoded: DecodedBoardImage,
  dimensions: { display: ImageDimensions; thumbnail: ImageDimensions },
  runtime: BrowserImagePreparationRuntime,
  mimeType: 'image/webp' | 'image/jpeg',
) {
  const display = await runtime.encode(
    decoded.source,
    dimensions.display,
    mimeType,
    DISPLAY_QUALITY,
  );
  const thumbnail = await runtime.encode(
    decoded.source,
    dimensions.thumbnail,
    mimeType,
    THUMBNAIL_QUALITY,
  );
  return { display, thumbnail };
}

/**
 * Decodes browser orientation before sizing, then returns only re-encoded
 * derivatives. The source File is represented by metadata and is never part
 * of the uploadable result.
 */
export async function prepareBoardImage(
  file: File,
  options: PrepareBoardImageOptions,
): Promise<PreparedBoardImage> {
  assertAssetId(options.assetId);
  const runtime = options.runtime ?? browserImagePreparationRuntime;
  const decoded = await runtime.decode(file, { imageOrientation: 'from-image' });

  try {
    positiveDimension(decoded.width, 'Decoded image width');
    positiveDimension(decoded.height, 'Decoded image height');
    const dimensions = {
      display: containImageDimensions(
        decoded.width,
        decoded.height,
        options.displayMaxEdge ?? BOARD_IMAGE_DISPLAY_MAX_EDGE,
      ),
      thumbnail: containImageDimensions(
        decoded.width,
        decoded.height,
        options.thumbnailMaxEdge ?? BOARD_IMAGE_THUMBNAIL_MAX_EDGE,
      ),
    };

    let mimeType: 'image/webp' | 'image/jpeg' = (await runtime.supportsWebP())
      ? 'image/webp'
      : 'image/jpeg';
    let blobs: { display: Blob; thumbnail: Blob };
    try {
      blobs = await encodeVariants(decoded, dimensions, runtime, mimeType);
    } catch (error) {
      if (mimeType !== 'image/webp') throw error;
      mimeType = 'image/jpeg';
      blobs = await encodeVariants(decoded, dimensions, runtime, mimeType);
    }

    const extension = mimeType === 'image/webp' ? 'webp' : 'jpg';
    const names = fileNames(options.assetId, extension);
    const variant = (
      blob: Blob,
      name: string,
      size: ImageDimensions,
    ): PreparedBoardImageVariant => ({
      file: new File([blob], name, { type: mimeType, lastModified: file.lastModified }),
      ...size,
      mimeType,
      extension,
    });

    return {
      assetId: options.assetId,
      aspectRatio: decoded.width / decoded.height,
      original: {
        name: file.name,
        mimeType: file.type,
        byteSize: file.size,
        width: decoded.width,
        height: decoded.height,
      },
      display: variant(blobs.display, names.display, dimensions.display),
      thumbnail: variant(blobs.thumbnail, names.thumbnail, dimensions.thumbnail),
    };
  } finally {
    decoded.dispose?.();
  }
}
