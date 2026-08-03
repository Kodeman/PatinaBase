import {
  prepareAndUploadBoardImages,
  uploadPreparedBoardImage,
  type BoardAssetStorage,
} from '../upload-board-assets';
import type { PreparedBoardImage } from '../image-preparation';

function prepared(assetId: string): PreparedBoardImage {
  return {
    assetId,
    aspectRatio: 2,
    original: {
      name: 'never-upload-me.jpg',
      mimeType: 'image/jpeg',
      byteSize: 999,
      width: 2000,
      height: 1000,
    },
    display: {
      file: new File(['display'], `${assetId}.webp`, { type: 'image/webp' }),
      width: 2000,
      height: 1000,
      mimeType: 'image/webp',
      extension: 'webp',
    },
    thumbnail: {
      file: new File(['thumb'], `${assetId}-thumb.webp`, { type: 'image/webp' }),
      width: 400,
      height: 200,
      mimeType: 'image/webp',
      extension: 'webp',
    },
  };
}

function storage(): BoardAssetStorage & {
  upload: jest.Mock;
  remove: jest.Mock;
  getPublicUrl: jest.Mock;
} {
  return {
    upload: jest.fn(async (path: string) => ({ path })),
    remove: jest.fn(async () => undefined),
    getPublicUrl: jest.fn((path: string) => `https://storage.example/${path}`),
  };
}

describe('canonical mood-board asset upload', () => {
  it('uploads display plus thumbnail and returns the board-item persistence shape', async () => {
    const bucket = storage();
    const result = await uploadPreparedBoardImage({
      ownerId: 'owner-id',
      boardId: 'board-id',
      image: prepared('asset-id'),
      storage: bucket,
    });

    expect(bucket.upload.mock.calls.map(([path]) => path)).toEqual([
      'owner-id/boards/board-id/asset-id.webp',
      'owner-id/boards/board-id/asset-id-thumb.webp',
    ]);
    expect(bucket.upload.mock.calls.map(([, file]) => file.name)).toEqual([
      'asset-id.webp',
      'asset-id-thumb.webp',
    ]);
    expect(result).toMatchObject({
      image_url: 'https://storage.example/owner-id/boards/board-id/asset-id.webp',
      data: {
        thumbnail_url:
          'https://storage.example/owner-id/boards/board-id/asset-id-thumb.webp',
      },
      assets: {
        display: { path: 'owner-id/boards/board-id/asset-id.webp' },
        thumbnail: { path: 'owner-id/boards/board-id/asset-id-thumb.webp' },
      },
    });
  });

  it('removes the display derivative when the thumbnail upload fails', async () => {
    const bucket = storage();
    bucket.upload
      .mockResolvedValueOnce({ path: 'owner-id/boards/board-id/asset-id.webp' })
      .mockRejectedValueOnce(new Error('thumbnail upload failed'));

    await expect(
      uploadPreparedBoardImage({
        ownerId: 'owner-id',
        boardId: 'board-id',
        image: prepared('asset-id'),
        storage: bucket,
      }),
    ).rejects.toThrow('thumbnail upload failed');
    expect(bucket.remove).toHaveBeenCalledWith([
      'owner-id/boards/board-id/asset-id.webp',
    ]);
  });

  it('uses unique IDs per source, uploads no original File, and rolls back a partial batch', async () => {
    const bucket = storage();
    const originals = [
      new File(['original-a'], 'a.jpg', { type: 'image/jpeg' }),
      new File(['original-b'], 'b.jpg', { type: 'image/jpeg' }),
    ];
    const prepare = jest
      .fn()
      .mockResolvedValueOnce(prepared('asset-a'))
      .mockResolvedValueOnce(prepared('asset-b'));
    bucket.upload.mockImplementation(async (path: string) => {
      if (path.includes('asset-b-thumb')) throw new Error('second thumbnail failed');
      return { path };
    });

    await expect(
      prepareAndUploadBoardImages({
        ownerId: 'owner-id',
        boardId: 'board-id',
        files: originals,
        storage: bucket,
        createAssetId: jest.fn().mockReturnValueOnce('asset-a').mockReturnValueOnce('asset-b'),
        prepare,
      }),
    ).rejects.toThrow('second thumbnail failed');

    expect(prepare.mock.calls.map(([, options]) => options.assetId)).toEqual([
      'asset-a',
      'asset-b',
    ]);
    const uploadedFiles = bucket.upload.mock.calls.map(([, file]) => file);
    expect(uploadedFiles).not.toContain(originals[0]);
    expect(uploadedFiles).not.toContain(originals[1]);
    expect(bucket.remove).toHaveBeenCalledWith([
      'owner-id/boards/board-id/asset-b.webp',
    ]);
    expect(bucket.remove).toHaveBeenCalledWith([
      'owner-id/boards/board-id/asset-a.webp',
      'owner-id/boards/board-id/asset-a-thumb.webp',
    ]);
  });

  it('rejects a preparer that changes the allocated asset ID before upload', async () => {
    const bucket = storage();

    await expect(
      prepareAndUploadBoardImages({
        ownerId: 'owner-id',
        boardId: 'board-id',
        files: [new File(['original'], 'source.jpg', { type: 'image/jpeg' })],
        storage: bucket,
        createAssetId: () => 'allocated-id',
        prepare: jest.fn().mockResolvedValue(prepared('different-id')),
      }),
    ).rejects.toThrow('Prepared board asset ID does not match its allocation');
    expect(bucket.upload).not.toHaveBeenCalled();
  });

  it('reports per-file preparation, upload, and completion progress', async () => {
    const bucket = storage();
    const file = new File(['original'], 'source.jpg', { type: 'image/jpeg' });
    const onProgress = jest.fn();

    await prepareAndUploadBoardImages({
      ownerId: 'owner-id',
      boardId: 'board-id',
      files: [file],
      storage: bucket,
      createAssetId: () => 'asset-id',
      prepare: jest.fn().mockResolvedValue(prepared('asset-id')),
      onProgress,
    });

    expect(onProgress.mock.calls.map(([progress]) => progress.stage)).toEqual([
      'preparing',
      'uploading',
      'complete',
    ]);
    expect(onProgress).toHaveBeenLastCalledWith({
      file,
      index: 0,
      total: 1,
      stage: 'complete',
    });
  });
});
