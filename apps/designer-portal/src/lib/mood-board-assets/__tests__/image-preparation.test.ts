import {
  BOARD_IMAGE_DISPLAY_MAX_EDGE,
  BOARD_IMAGE_THUMBNAIL_MAX_EDGE,
  containImageDimensions,
  prepareBoardImage,
  type BrowserImagePreparationRuntime,
} from '../image-preparation';

function runtime(options: { webp?: boolean; failWebp?: boolean } = {}) {
  const dispose = jest.fn();
  const source = {} as CanvasImageSource;
  const value: BrowserImagePreparationRuntime = {
    decode: jest.fn().mockResolvedValue({ source, width: 6000, height: 3000, dispose }),
    supportsWebP: jest.fn().mockResolvedValue(options.webp ?? true),
    encode: jest.fn(async (_source, dimensions, mimeType) => {
      if (options.failWebp && mimeType === 'image/webp') {
        throw new Error('WebP encoder unavailable');
      }
      return new Blob([`${dimensions.width}x${dimensions.height}`], { type: mimeType });
    }),
  };
  return { value, dispose };
}

describe('mood-board browser image preparation', () => {
  it.each([
    [{ width: 6000, height: 3000 }, 2400, { width: 2400, height: 1200 }],
    [{ width: 1200, height: 3600 }, 2400, { width: 800, height: 2400 }],
    [{ width: 320, height: 200 }, 2400, { width: 320, height: 200 }],
    [{ width: 101, height: 50 }, 40, { width: 40, height: 20 }],
  ])('contains %o inside %dpx without upscaling', (input, maxEdge, expected) => {
    expect(containImageDimensions(input.width, input.height, maxEdge)).toEqual(expected);
  });

  it('decodes with EXIF orientation, creates bounded display/thumbnail WebP files, and disposes', async () => {
    const browser = runtime();
    const original = new File([new Uint8Array([1, 2, 3, 4])], 'camera-original.jpeg', {
      type: 'image/jpeg',
      lastModified: 1234,
    });

    const prepared = await prepareBoardImage(original, {
      assetId: 'asset-123',
      runtime: browser.value,
    });

    expect(browser.value.decode).toHaveBeenCalledWith(original, {
      imageOrientation: 'from-image',
    });
    expect(prepared).toMatchObject({
      assetId: 'asset-123',
      aspectRatio: 2,
      original: {
        name: 'camera-original.jpeg',
        mimeType: 'image/jpeg',
        byteSize: 4,
        width: 6000,
        height: 3000,
      },
      display: {
        width: BOARD_IMAGE_DISPLAY_MAX_EDGE,
        height: 1200,
        mimeType: 'image/webp',
        extension: 'webp',
      },
      thumbnail: {
        width: BOARD_IMAGE_THUMBNAIL_MAX_EDGE,
        height: 200,
        mimeType: 'image/webp',
        extension: 'webp',
      },
    });
    expect(prepared.display.file.name).toBe('asset-123.webp');
    expect(prepared.thumbnail.file.name).toBe('asset-123-thumb.webp');
    expect(prepared.display.file.lastModified).toBe(1234);
    expect(prepared.thumbnail.file.lastModified).toBe(1234);
    expect(prepared.display.file).not.toBe(original);
    expect(prepared.thumbnail.file).not.toBe(original);
    expect(browser.dispose).toHaveBeenCalledTimes(1);
  });

  it('uses JPEG when WebP is unsupported', async () => {
    const browser = runtime({ webp: false });
    const prepared = await prepareBoardImage(
      new File(['source'], 'source.png', { type: 'image/png' }),
      { assetId: 'asset-jpeg', runtime: browser.value },
    );

    expect(prepared.display.file.name).toBe('asset-jpeg.jpg');
    expect(prepared.thumbnail.file.name).toBe('asset-jpeg-thumb.jpg');
    expect(prepared.display.mimeType).toBe('image/jpeg');
    expect(prepared.thumbnail.mimeType).toBe('image/jpeg');
  });

  it('falls back both derivatives to JPEG if a claimed WebP encoder fails', async () => {
    const browser = runtime({ webp: true, failWebp: true });
    const prepared = await prepareBoardImage(
      new File(['source'], 'source.png', { type: 'image/png' }),
      { assetId: 'asset-fallback', runtime: browser.value },
    );

    expect(prepared.display.mimeType).toBe('image/jpeg');
    expect(prepared.thumbnail.mimeType).toBe('image/jpeg');
    expect(browser.value.encode).toHaveBeenCalledWith(
      expect.anything(),
      { width: 2400, height: 1200 },
      'image/jpeg',
      expect.any(Number),
    );
  });
});
