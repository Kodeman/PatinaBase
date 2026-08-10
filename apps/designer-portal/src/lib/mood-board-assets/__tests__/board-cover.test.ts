import { generateAndUploadMoodBoardCover } from '../board-cover';

describe('mood board cover generation', () => {
  it('uploads the canonical cover path only after the shared painter succeeds', async () => {
    const blob = new Blob(['cover'], { type: 'image/png' });
    const raster = {
      blob,
      width: 800,
      height: 600,
      effectiveScale: 0.5,
      warnings: [],
      paintedItemKeys: ['item-1'],
      geometry: {},
    };
    const renderer = jest.fn().mockResolvedValue(raster);
    const storage = {
      upload: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
      url: jest.fn().mockResolvedValue('https://assets.example/cover.png'),
    };

    const result = await generateAndUploadMoodBoardCover({
      ownerId: 'proposal_1',
      boardId: 'board_1',
      input: {
        canvasWidth: 1200,
        canvasHeight: 800,
        backgroundColor: '#FAF8F5',
        sections: [],
        items: [],
      },
      renderer: renderer as never,
      storage,
    });
    expect(result.path).toBe('proposal_1/boards/board_1/cover.png');
    expect(result.url).toBe('https://assets.example/cover.png');
    expect(result.raster).toBe(raster);
    expect(storage.upload).toHaveBeenCalledWith(
      'proposal_1/boards/board_1/cover.png',
      blob,
    );
  });

  it('rejects path traversal before rendering or uploading', async () => {
    const renderer = jest.fn();
    await expect(
      generateAndUploadMoodBoardCover({
        ownerId: '../proposal',
        boardId: 'board_1',
        input: {
          canvasWidth: 1200,
          canvasHeight: 800,
          backgroundColor: '#FAF8F5',
          sections: [],
          items: [],
        },
        renderer,
      }),
    ).rejects.toThrow('Owner ID must be a safe storage-path segment');
    expect(renderer).not.toHaveBeenCalled();
  });
});
