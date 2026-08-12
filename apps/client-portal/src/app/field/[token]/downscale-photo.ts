/**
 * Client-side downscale for the field guest "Problem" photo attachment
 * (Field Coordination). Phone camera photos run 2-6MB raw; the Server
 * Action they post through has a body-size ceiling (see next.config.js),
 * and even where that ceiling is raised, shrinking the file client-side
 * before it ever touches state/network is strictly better for a mobile
 * upload on the field. Non-image files and anything already small pass
 * through unchanged; any failure along the way (canvas/codec support,
 * decode error) falls back to the original file rather than blocking the
 * report.
 */

const MAX_LONG_EDGE = 1600;
const JPEG_QUALITY = 0.8;
const SKIP_BELOW_BYTES = 1024 * 1024; // 1MB — not worth re-encoding

export async function downscalePhoto(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  if (file.size <= SKIP_BELOW_BYTES) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    const longEdge = Math.max(width, height);

    if (longEdge <= MAX_LONG_EDGE) {
      bitmap.close?.();
      return file;
    }

    const scale = MAX_LONG_EDGE / longEdge;
    const targetWidth = Math.round(width * scale);
    const targetHeight = Math.round(height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close?.();
      return file;
    }

    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), 'image/jpeg', JPEG_QUALITY);
    });
    if (!blob) return file;

    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file;
  }
}
