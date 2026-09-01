import type { EditableMoodBoardItem } from '@patina/types';
import {
  collectPresentPrefetchTargets,
  warmPresentImages,
  type PrefetchImageLike,
} from './present-prefetch';

function item(overrides: Partial<EditableMoodBoardItem>): EditableMoodBoardItem {
  return {
    id: 'item-1',
    type: 'image',
    x: 0,
    y: 0,
    width: 100,
    ...overrides,
  };
}

function fakeImageFactory() {
  const created: PrefetchImageLike[] = [];
  const createImage = () => {
    const image: PrefetchImageLike = { src: '', onload: null, onerror: null };
    created.push(image);
    return image;
  };
  return { created, createImage };
}

describe('collectPresentPrefetchTargets', () => {
  it('collects each item imageUrl plus the cover, de-duplicated', () => {
    const items: EditableMoodBoardItem[] = [
      item({ id: 'a', imageUrl: 'https://cdn.example/a.jpg' }),
      item({ id: 'b', imageUrl: 'https://cdn.example/b.jpg' }),
      item({ id: 'c', imageUrl: 'https://cdn.example/a.jpg' }), // duplicate of a
      item({ id: 'd', type: 'note', content: 'hi' }), // no image at all
    ];

    const targets = collectPresentPrefetchTargets(items, 'https://cdn.example/cover.jpg');

    expect(targets.map((t) => t.url)).toEqual([
      'https://cdn.example/a.jpg',
      'https://cdn.example/b.jpg',
      'https://cdn.example/cover.jpg',
    ]);
  });

  it('falls back to data.image_url when imageUrl is absent', () => {
    const items: EditableMoodBoardItem[] = [
      item({ id: 'a', imageUrl: null, data: { image_url: 'https://cdn.example/snap.jpg' } }),
    ];

    const targets = collectPresentPrefetchTargets(items, null);

    expect(targets).toEqual([{ key: 'a', url: 'https://cdn.example/snap.jpg' }]);
  });

  it('omits the cover key when no cover image is set', () => {
    const targets = collectPresentPrefetchTargets([], undefined);
    expect(targets).toEqual([]);
  });

  it('skips a placeholder item with no image anywhere', () => {
    const items: EditableMoodBoardItem[] = [
      item({ id: 'placeholder', imageUrl: null, data: { name: 'Floor plan' } }),
    ];
    expect(collectPresentPrefetchTargets(items, null)).toEqual([]);
  });
});

describe('warmPresentImages', () => {
  it('requests every distinct target and reports progress as each settles', () => {
    const { created, createImage } = fakeImageFactory();
    const warmed = new Set<string>();
    const onProgress = jest.fn();
    const onSettled = jest.fn();

    const handle = warmPresentImages(
      [
        { key: 'a', url: 'https://cdn.example/a.jpg' },
        { key: 'b', url: 'https://cdn.example/b.jpg' },
      ],
      warmed,
      { onProgress, onSettled, createImage },
    );

    expect(handle.total).toBe(2);
    expect(created).toHaveLength(2);
    expect(created.map((image) => image.src)).toEqual([
      'https://cdn.example/a.jpg',
      'https://cdn.example/b.jpg',
    ]);

    created[0]!.onload?.();
    expect(onProgress).toHaveBeenCalledWith(1, 2);
    expect(onSettled).not.toHaveBeenCalled();

    created[1]!.onerror?.(); // a failed load still counts toward progress
    expect(onProgress).toHaveBeenCalledWith(2, 2);
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(onSettled).toHaveBeenCalledWith(1); // one of the two failed
  });

  it('reports zero failures when every target loads successfully', () => {
    const { created, createImage } = fakeImageFactory();
    const onSettled = jest.fn();

    warmPresentImages(
      [
        { key: 'a', url: 'https://cdn.example/a.jpg' },
        { key: 'b', url: 'https://cdn.example/b.jpg' },
      ],
      new Set(),
      { onSettled, createImage },
    );
    created[0]!.onload?.();
    created[1]!.onload?.();

    expect(onSettled).toHaveBeenCalledWith(0);
  });

  it('reports every failure when every target errors', () => {
    const { created, createImage } = fakeImageFactory();
    const onSettled = jest.fn();

    warmPresentImages(
      [
        { key: 'a', url: 'https://cdn.example/a.jpg' },
        { key: 'b', url: 'https://cdn.example/b.jpg' },
        { key: 'c', url: 'https://cdn.example/c.jpg' },
      ],
      new Set(),
      { onSettled, createImage },
    );
    created[0]!.onerror?.();
    created[1]!.onerror?.();
    created[2]!.onerror?.();

    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(onSettled).toHaveBeenCalledWith(3);
  });

  it('reports zero failures for the total===0 (already-warmed) settle path', () => {
    const onSettled = jest.fn();
    warmPresentImages(
      [{ key: 'a', url: 'https://cdn.example/a.jpg' }],
      new Set(['https://cdn.example/a.jpg']),
      { onSettled },
    );
    expect(onSettled).toHaveBeenCalledWith(0);
  });

  it('still counts a failed load toward `warmed` so it is not retried on re-entry', () => {
    const { created, createImage } = fakeImageFactory();
    const warmed = new Set<string>();

    const first = warmPresentImages(
      [{ key: 'a', url: 'https://cdn.example/a.jpg' }],
      warmed,
      { createImage },
    );
    created[0]!.onerror?.();
    expect(first.total).toBe(1);

    const second = warmPresentImages(
      [{ key: 'a', url: 'https://cdn.example/a.jpg' }],
      warmed,
      { createImage },
    );
    expect(second.total).toBe(0);
    expect(created).toHaveLength(1); // no re-request of the previously-failed URL
  });

  it('never blocks the caller — the handle returns synchronously before any image settles', () => {
    const { createImage } = fakeImageFactory();
    const onSettled = jest.fn();
    warmPresentImages(
      [{ key: 'a', url: 'https://cdn.example/a.jpg' }],
      new Set(),
      { onSettled, createImage },
    );
    // Synchronous return proves the caller (Present's mode switch) was never
    // made to await the image; onSettled only fires once we simulate the load.
    expect(onSettled).not.toHaveBeenCalled();
  });

  it('settles immediately with total 0 when everything is already warmed', () => {
    const { created, createImage } = fakeImageFactory();
    const onSettled = jest.fn();
    const warmed = new Set(['https://cdn.example/a.jpg']);

    const handle = warmPresentImages(
      [{ key: 'a', url: 'https://cdn.example/a.jpg' }],
      warmed,
      { onSettled, createImage },
    );

    expect(handle.total).toBe(0);
    expect(created).toHaveLength(0);
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it('does not re-request a URL already warmed by a prior Present entry (no duplicate loads on re-entry)', () => {
    const { created, createImage } = fakeImageFactory();
    const warmed = new Set<string>();
    const targets = [
      { key: 'a', url: 'https://cdn.example/a.jpg' },
      { key: 'b', url: 'https://cdn.example/b.jpg' },
    ];

    const first = warmPresentImages(targets, warmed, { createImage });
    created[0]!.onload?.();
    created[1]!.onload?.();
    expect(first.total).toBe(2);

    // Re-entering Present with the same board — nothing new should load.
    const second = warmPresentImages(targets, warmed, { createImage });
    expect(second.total).toBe(0);
    expect(created).toHaveLength(2); // no additional Image() constructed

    // A genuinely new item added while re-entering does still get warmed.
    const third = warmPresentImages(
      [...targets, { key: 'c', url: 'https://cdn.example/c.jpg' }],
      warmed,
      { createImage },
    );
    expect(third.total).toBe(1);
    expect(created).toHaveLength(3);
  });

  it('stops reporting progress once cancelled', () => {
    const { created, createImage } = fakeImageFactory();
    const onProgress = jest.fn();
    const onSettled = jest.fn();

    const handle = warmPresentImages(
      [{ key: 'a', url: 'https://cdn.example/a.jpg' }],
      new Set(),
      { onProgress, onSettled, createImage },
    );
    handle.cancel();
    created[0]!.onload?.();

    expect(onProgress).not.toHaveBeenCalled();
    expect(onSettled).not.toHaveBeenCalled();
  });
});
