import type { ProposalCapture } from '@patina/supabase';
import type { ProductPickResult } from '@/components/portal/proposals/product-picker-modal';
import { boardItemThumbnail, captureToBoardItem, productPickToBoardItem } from '../board-add-rail';

describe('mood-board add rail item provenance', () => {
  it('keeps extension capture lineage and source metadata on the canvas item', () => {
    const capture = {
      id: 'capture-1',
      product_id: 'product-1',
      thumbnail_url: 'https://images.example/capture.jpg',
      source_url: 'https://maker.example/chair',
      raw_payload: {
        productName: 'Oak chair',
        vendorName: 'Maker Studio',
      },
    } as ProposalCapture;

    expect(captureToBoardItem(capture, { x: 120, y: 80 }, 4)).toEqual(
      expect.objectContaining({
        type: 'capture',
        x: 120,
        y: 80,
        zIndex: 4,
        captureId: 'capture-1',
        productId: 'product-1',
        imageUrl: 'https://images.example/capture.jpg',
        data: expect.objectContaining({
          name: 'Oak chair',
          vendor_name: 'Maker Studio',
          source_url: 'https://maker.example/chair',
        }),
      }),
    );
  });

  it('distinguishes catalog products from capture-backed picker results', () => {
    const base: ProductPickResult = {
      productId: 'product-2',
      name: 'Linen sofa',
      imageUrl: 'https://images.example/sofa.jpg',
      priceCents: 420_000,
      vendorName: 'Atelier',
      scopeRoomId: null,
    };

    expect(productPickToBoardItem(base, { x: 0, y: 0 }, 1)).toEqual(
      expect.objectContaining({ type: 'product', productId: 'product-2', captureId: null }),
    );
    expect(
      productPickToBoardItem({ ...base, captureId: 'capture-2' }, { x: 0, y: 0 }, 1),
    ).toEqual(
      expect.objectContaining({
        type: 'capture',
        productId: 'product-2',
        captureId: 'capture-2',
      }),
    );
  });

  it('uses the bounded thumbnail in rail cards and falls back for legacy pins', () => {
    const base = {
      id: 'image-1',
      type: 'image' as const,
      x: 0,
      y: 0,
      width: 240,
      imageUrl: 'https://images.example/display.webp',
    };
    expect(boardItemThumbnail({
      ...base,
      data: { thumbnail_url: 'https://images.example/thumb.webp' },
    })).toBe('https://images.example/thumb.webp');
    expect(boardItemThumbnail(base)).toBe('https://images.example/display.webp');
  });
});
