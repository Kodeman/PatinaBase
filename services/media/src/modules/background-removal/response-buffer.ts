import {
  BackgroundRemovalStorageError,
  BackgroundRemovalVendorError,
} from './background-removal.errors';

export async function readResponseBuffer(
  response: Response,
  maxBytes: number,
  kind: 'storage' | 'vendor',
): Promise<Buffer> {
  const contentLength = Number(response.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw kind === 'storage'
      ? new BackgroundRemovalStorageError()
      : new BackgroundRemovalVendorError();
  }

  if (!response.body) {
    return Buffer.alloc(0);
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw kind === 'storage'
          ? new BackgroundRemovalStorageError()
          : new BackgroundRemovalVendorError();
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size);
}
