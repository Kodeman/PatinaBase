import type { MoodBoardRasterInput } from '@patina/design-system';
import { generateAndUploadMoodBoardCover } from '../board-cover';
import {
  createMoodBoardCoverLifecycle,
  MOOD_BOARD_COVER_DEBOUNCE_MS,
  type MoodBoardCoverSnapshot,
} from '../board-cover-lifecycle';

const initialInput: MoodBoardRasterInput = {
  canvasWidth: 1200,
  canvasHeight: 800,
  backgroundColor: '#FAF8F5',
  sections: [],
  items: [],
};

function snapshot(signature: string, input = initialInput): MoodBoardCoverSnapshot {
  return { boardId: 'board_1', signature, input };
}

describe('mood board cover lifecycle', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('turns an edit into render, stable-path upload, and board persistence after 30s', async () => {
    const blob = new Blob(['cover'], { type: 'image/png' });
    const renderer = jest.fn().mockResolvedValue({
      blob,
      width: 800,
      height: 600,
      effectiveScale: 0.5,
      warnings: [],
      paintedItemKeys: ['pin_1'],
      geometry: {},
    });
    const storage = {
      upload: jest.fn().mockResolvedValue(undefined),
      publicUrl: jest.fn().mockReturnValue('https://assets.example/cover.png'),
    };
    const persist = jest.fn().mockResolvedValue(undefined);
    const lifecycle = createMoodBoardCoverLifecycle({
      async write(current) {
        const generated = await generateAndUploadMoodBoardCover({
          ownerId: 'proposal_1',
          boardId: current.boardId,
          input: current.input,
          renderer: renderer as never,
          storage,
        });
        await persist({
          boardId: current.boardId,
          coverImageUrl: generated.url,
        });
      },
    });

    lifecycle.update(snapshot('initial'));
    await jest.advanceTimersByTimeAsync(MOOD_BOARD_COVER_DEBOUNCE_MS);
    expect(renderer).not.toHaveBeenCalled();

    const editedInput = {
      ...initialInput,
      items: [{
        id: 'pin_1',
        type: 'note' as const,
        x: 40,
        y: 50,
        width: 200,
        height: 120,
        zIndex: 1,
        content: 'Edited',
        data: {},
      }],
    };
    lifecycle.update(snapshot('edited', editedInput));
    await jest.advanceTimersByTimeAsync(MOOD_BOARD_COVER_DEBOUNCE_MS - 1);
    expect(renderer).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);

    expect(renderer).toHaveBeenCalledWith(editedInput);
    expect(storage.upload).toHaveBeenCalledWith(
      'proposal_1/boards/board_1/cover.png',
      blob,
    );
    expect(persist).toHaveBeenCalledWith({
      boardId: 'board_1',
      coverImageUrl: 'https://assets.example/cover.png',
    });
  });

  it('forces the latest cover on room exit and cancels the pending debounce', async () => {
    const write = jest.fn().mockResolvedValue(undefined);
    const lifecycle = createMoodBoardCoverLifecycle({ write });
    lifecycle.update(snapshot('initial'));
    lifecycle.update(snapshot('edited'));

    await lifecycle.flush(true);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(snapshot('edited'));

    await jest.advanceTimersByTimeAsync(MOOD_BOARD_COVER_DEBOUNCE_MS);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('keeps cover failures silent and retryable so launchers can render their fallback', async () => {
    const failure = new Error('renderer unavailable');
    const write = jest.fn().mockRejectedValue(failure);
    const onError = jest.fn();
    const lifecycle = createMoodBoardCoverLifecycle({ write, onError });
    lifecycle.update(snapshot('initial'));
    lifecycle.update(snapshot('edited'));

    await expect(lifecycle.flush()).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledWith(failure);

    await expect(lifecycle.flush(true)).resolves.toBeUndefined();
    expect(write).toHaveBeenCalledTimes(2);
  });
});
