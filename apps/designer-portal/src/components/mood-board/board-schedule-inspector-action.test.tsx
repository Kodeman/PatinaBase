import { fireEvent, render, screen } from '@testing-library/react';
import { BoardScheduleInspectorAction, scheduleSnapshotForBoardItem } from './board-schedule-inspector-action';

const addItemMutateAsync = jest.fn();

jest.mock('@patina/supabase', () => ({
  useAddProposalItem: () => ({ mutateAsync: addItemMutateAsync, isPending: false }),
  useProposalScheduleItems: () => ({ data: [], isLoading: false, isError: false }),
}));

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
      vendorId: null,
      vendorName: null,
      sourceUrl: null,
      proposalItemId: null,
    });
  });

  it('reads the vendor, source_url and schedule backlink a pin carries', () => {
    expect(scheduleSnapshotForBoardItem({
      id: 'item-3',
      type: 'capture',
      x: 0,
      y: 0,
      width: 200,
      productId: null,
      data: {
        name: 'Rattan lounge',
        price_cents: 89900,
        vendor_id: 'vendor-9',
        vendor_name: 'Marlow & Co',
        source_url: 'https://maker.example/lounge',
        proposalItemId: 'line-7',
      },
    })).toMatchObject({
      vendorId: 'vendor-9',
      vendorName: 'Marlow & Co',
      sourceUrl: 'https://maker.example/lounge',
      proposalItemId: 'line-7',
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

describe('double-send guard (SQ-368 F15)', () => {
  const item = {
    id: 'pin-double-send',
    type: 'product' as const,
    x: 0,
    y: 0,
    width: 200,
    productId: 'product-1',
    imageUrl: null,
    data: { name: 'Marlow chair', price_cents: 125000 },
  };

  it('a second send for the same pin while one is already in flight is a no-op', async () => {
    let resolveAdd: (value: { id: string }) => void = () => {};
    addItemMutateAsync.mockReset();
    addItemMutateAsync.mockImplementation(
      () => new Promise<{ id: string }>((resolve) => { resolveAdd = resolve; }),
    );

    render(<BoardScheduleInspectorAction proposalId="proposal-1" scopeRoomId={null} item={item} />);

    const button = screen.getByRole('button', { name: 'Send to the schedule' });
    // The mocked mutation's isPending stays false until it resolves, so the
    // button never disables itself between clicks — exactly the race SQ-368
    // F15 covers (a second menu/inspector trigger before the first settles).
    fireEvent.click(button);
    fireEvent.click(button);

    expect(addItemMutateAsync).toHaveBeenCalledTimes(1);

    resolveAdd({ id: 'line-1' });
    await screen.findByText(/Added to the schedule/);
  });
});
