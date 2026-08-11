import { describe, expect, it, vi } from 'vitest';
import {
  normalizeBoardMediaValue,
  signBoardMediaValue,
} from '../board-storage';
import { proposalBoardUrlToPath } from '../storage-url';

const path = 'owner-id/boards/board-id/image.webp';

describe('private board storage references', () => {
  it('normalizes legacy public, signed, and bare forms to one path', () => {
    expect(proposalBoardUrlToPath(path)).toBe(path);
    expect(proposalBoardUrlToPath(`proposal-mood-boards/${path}`)).toBe(path);
    expect(proposalBoardUrlToPath(
      `https://storage.example/storage/v1/object/public/proposal-mood-boards/${path}?download=1`,
    )).toBe(path);
    expect(proposalBoardUrlToPath(
      `https://storage.example/storage/v1/object/sign/proposal-mood-boards/${path}?token=secret`,
    )).toBe(path);
    expect(proposalBoardUrlToPath('https://images.example/product.webp')).toBeNull();
  });

  it('normalizes only explicit media fields before persistence', () => {
    expect(normalizeBoardMediaValue({
      image_url: `https://storage.example/storage/v1/object/public/proposal-mood-boards/${path}`,
      content: path,
      data: { thumbnail_url: `proposal-mood-boards/${path}` },
    })).toEqual({
      image_url: path,
      content: path,
      data: { thumbnail_url: path },
    });
  });

  it('batch signs distinct private refs and preserves external media', async () => {
    const createSignedUrls = vi.fn().mockResolvedValue({
      data: [{ path, signedUrl: 'https://storage.example/signed/image' }],
      error: null,
    });
    const result = await signBoardMediaValue({
      storage: { from: vi.fn(() => ({ createSignedUrls })) },
    }, {
      cover_image_url: path,
      items: [
        { image_url: path },
        { image_url: 'https://images.example/product.webp' },
      ],
    });

    expect(createSignedUrls).toHaveBeenCalledWith([path], 3600);
    expect(result).toEqual({
      cover_image_url: 'https://storage.example/signed/image',
      items: [
        { image_url: 'https://storage.example/signed/image' },
        { image_url: 'https://images.example/product.webp' },
      ],
    });
  });
});
