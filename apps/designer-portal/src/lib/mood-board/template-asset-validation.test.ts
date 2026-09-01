import type { EditableMoodBoardItem } from '@patina/types';
import {
  findMissingTemplateAssets,
  probeTemplateAssetImages,
  type ProbeImageLike,
} from './template-asset-validation';

function item(overrides: Partial<EditableMoodBoardItem> = {}): EditableMoodBoardItem {
  return {
    id: 'item-1',
    type: 'image',
    x: 0,
    y: 0,
    width: 100,
    ...overrides,
  };
}

describe('findMissingTemplateAssets (DV13)', () => {
  it('flags a visual item with no image reference at all', () => {
    const issues = findMissingTemplateAssets([
      item({ id: 'a', type: 'image', imageUrl: null }),
    ]);
    expect(issues).toEqual([{ itemId: 'a', label: 'image pin', reason: 'missing' }]);
  });

  it('is quiet for a visual item carrying an image via data.image_url', () => {
    const issues = findMissingTemplateAssets([
      item({ id: 'a', type: 'product', imageUrl: null, data: { image_url: 'https://img/x.jpg' } }),
    ]);
    expect(issues).toEqual([]);
  });

  it('never flags non-visual item types (notes, palettes)', () => {
    const issues = findMissingTemplateAssets([
      item({ id: 'a', type: 'note', imageUrl: null, content: 'Ask about finish' }),
      item({ id: 'b', type: 'palette', imageUrl: null }),
    ]);
    expect(issues).toEqual([]);
  });

  it('prefers the item name, falling back to content then a generic label', () => {
    const [issue] = findMissingTemplateAssets([
      item({ id: 'a', type: 'capture', imageUrl: null, data: { name: 'Holly Hunt Chair' } }),
    ]);
    expect(issue.label).toBe('Holly Hunt Chair');
  });
});

describe('probeTemplateAssetImages (DV13)', () => {
  function fakeImageFactory(outcomes: Record<string, 'ok' | 'fail'>): () => ProbeImageLike {
    return () => {
      const img: ProbeImageLike = { src: '', onload: null, onerror: null };
      Object.defineProperty(img, 'src', {
        set(value: string) {
          const outcome = outcomes[value] ?? 'ok';
          queueMicrotask(() => {
            if (outcome === 'ok') img.onload?.();
            else img.onerror?.();
          });
        },
        get() {
          return '';
        },
      });
      return img;
    };
  }

  it('resolves empty when there is nothing with an image reference to check', async () => {
    const result = await probeTemplateAssetImages([item({ type: 'note', imageUrl: null })]);
    expect(result).toEqual([]);
  });

  it('reports only the items whose image failed to load', async () => {
    const items = [
      item({ id: 'good', type: 'image', imageUrl: 'https://img/good.jpg' }),
      item({ id: 'bad', type: 'image', imageUrl: 'https://img/bad.jpg', data: { name: 'Broken swatch' } }),
    ];
    const result = await probeTemplateAssetImages(items, {
      createImage: fakeImageFactory({ 'https://img/good.jpg': 'ok', 'https://img/bad.jpg': 'fail' }),
    });
    expect(result).toEqual([{ itemId: 'bad', label: 'Broken swatch', reason: 'broken' }]);
  });

  it('never hangs — settles via the timeout if an image never fires load/error', async () => {
    const stub: () => ProbeImageLike = () => ({ src: '', onload: null, onerror: null });
    const result = await probeTemplateAssetImages(
      [item({ id: 'stuck', type: 'image', imageUrl: 'https://img/stuck.jpg' })],
      { createImage: stub, timeoutMs: 5 },
    );
    expect(result).toEqual([]);
  });
});
