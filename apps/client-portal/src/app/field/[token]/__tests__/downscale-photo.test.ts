import { downscalePhoto } from '../downscale-photo';

/** Build a File of an exact byte size without allocating real image bytes. */
function makeFile(bytes: number, type: string, name = 'photo.jpg'): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe('downscalePhoto', () => {
  it('passes non-image files through unchanged', async () => {
    const file = makeFile(3 * 1024 * 1024, 'application/pdf', 'note.pdf');
    const result = await downscalePhoto(file);
    expect(result).toBe(file);
  });

  it('passes small images through unchanged without touching canvas APIs', async () => {
    const createImageBitmap = jest.fn();
    // @ts-expect-error jsdom doesn't implement this
    global.createImageBitmap = createImageBitmap;

    const file = makeFile(512 * 1024, 'image/jpeg'); // under the 1MB skip threshold
    const result = await downscalePhoto(file);

    expect(result).toBe(file);
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it('passes large-but-already-small-dimension images through unchanged', async () => {
    const close = jest.fn();
    // @ts-expect-error jsdom doesn't implement this
    global.createImageBitmap = jest.fn().mockResolvedValue({ width: 1200, height: 800, close });

    const file = makeFile(2 * 1024 * 1024, 'image/jpeg');
    const result = await downscalePhoto(file);

    expect(result).toBe(file);
    expect(close).toHaveBeenCalled();
  });

  it('downscales a large image to a JPEG capped at the max long edge, requesting EXIF-aware orientation', async () => {
    const close = jest.fn();
    const createImageBitmap = jest.fn().mockResolvedValue({ width: 4000, height: 3000, close });
    // @ts-expect-error jsdom doesn't implement this
    global.createImageBitmap = createImageBitmap;

    const drawImage = jest.fn();
    const outputBlob = new Blob([new Uint8Array(100 * 1024)], { type: 'image/jpeg' });
    const toBlob = jest.fn((cb: (b: Blob | null) => void) => cb(outputBlob));

    const originalCreateElement = document.createElement.bind(document);
    jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => ({ drawImage }),
          toBlob,
        } as unknown as HTMLCanvasElement;
      }
      return originalCreateElement(tag);
    });

    const file = makeFile(6 * 1024 * 1024, 'image/jpeg', 'big.heic');
    const result = await downscalePhoto(file);

    expect(result).not.toBe(file);
    expect(result.type).toBe('image/jpeg');
    expect(result.name).toBe('big.jpg');
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1600, 1200);
    expect(close).toHaveBeenCalled();
    expect(createImageBitmap).toHaveBeenCalledWith(file, { imageOrientation: 'from-image' });

    (document.createElement as jest.Mock).mockRestore();
  });

  it('retries without the options bag when a browser throws on imageOrientation, and still downscales', async () => {
    const close = jest.fn();
    const createImageBitmap = jest.fn().mockImplementation((_file: File, options?: unknown) => {
      if (options) return Promise.reject(new Error('options bag unsupported'));
      return Promise.resolve({ width: 4000, height: 3000, close });
    });
    // @ts-expect-error jsdom doesn't implement this
    global.createImageBitmap = createImageBitmap;

    const drawImage = jest.fn();
    const outputBlob = new Blob([new Uint8Array(100 * 1024)], { type: 'image/jpeg' });
    const toBlob = jest.fn((cb: (b: Blob | null) => void) => cb(outputBlob));

    const originalCreateElement = document.createElement.bind(document);
    jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => ({ drawImage }),
          toBlob,
        } as unknown as HTMLCanvasElement;
      }
      return originalCreateElement(tag);
    });

    const file = makeFile(6 * 1024 * 1024, 'image/jpeg');
    const result = await downscalePhoto(file);

    expect(createImageBitmap).toHaveBeenNthCalledWith(1, file, { imageOrientation: 'from-image' });
    expect(createImageBitmap).toHaveBeenNthCalledWith(2, file);
    expect(result).not.toBe(file);
    expect(result.type).toBe('image/jpeg');

    (document.createElement as jest.Mock).mockRestore();
  });

  it('falls back to the original file when both the options-bag and plain decode throw', async () => {
    // @ts-expect-error jsdom doesn't implement this
    global.createImageBitmap = jest.fn().mockRejectedValue(new Error('decode failed'));

    const file = makeFile(6 * 1024 * 1024, 'image/jpeg');
    const result = await downscalePhoto(file);

    expect(result).toBe(file);
  });
});
