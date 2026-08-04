import { scheduleSnapshotForBoardItem } from './board-schedule-inspector-action';

describe('scheduleSnapshotForBoardItem', () => {
  it('maps the persisted board pin snapshot without inventing live values', () => {
    expect(scheduleSnapshotForBoardItem({
      id: 'item-1',
      type: 'product',
      x: 0,
      y: 0,
      width: 200,
      productId: 'product-1',
      imageUrl: null,
      data: {
        name: 'Marlow chair',
        price_cents: 125000,
        image_url: 'https://assets.example/chair.jpg',
      },
    })).toEqual({
      type: 'product',
      productId: 'product-1',
      name: 'Marlow chair',
      imageUrl: 'https://assets.example/chair.jpg',
      priceCents: 125000,
    });
  });

  it('normalizes malformed optional snapshot values to null', () => {
    expect(scheduleSnapshotForBoardItem({
      id: 'item-2',
      type: 'capture',
      x: 0,
      y: 0,
      width: 200,
      productId: null,
      data: { name: '   ', price_cents: '125' },
    })).toMatchObject({ productId: null, name: null, imageUrl: null, priceCents: null });
  });
});
