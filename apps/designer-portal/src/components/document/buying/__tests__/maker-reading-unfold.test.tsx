/**
 * SQ-444 (US-16 P1-20): ordering a line from its unfold in the by-maker
 * reading moves the line out of "not yet ordered" and onto its new purchase
 * order. The unfold must survive that move — LineUnfold holds the Order
 * Assistant and the PO preview in local state, so a remount closes the
 * Assistant before Send and the preview never opens.
 *
 * The stand-in unfold keeps the same kind of local state LineUnfold does;
 * any remount drops it.
 */
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MakerReadingTable, type MakerReadingRow } from '../maker-reading';

jest.mock('@patina/supabase', () => ({
  useProjectV2: () => ({ data: null }),
  useCanSeeStudioMargin: () => ({ data: false }),
}));

type Row = MakerReadingRow;

const hale = { vendor_id: 'vendor-hale', vendor_name: 'Hale Workshop' };

const sofa = (onOrder: boolean): Row => ({
  item: {
    id: 'sofa',
    name: 'Sofa',
    ...hale,
    quantity: 1,
    trade_price_cents: 648_000,
    ...(onOrder
      ? {
          purchase_order_id: 'po-new',
          purchase_order: { id: 'po-new', vendor_id: 'vendor-hale', status: 'draft' },
        }
      : {}),
  },
});

const chair: Row = {
  item: {
    id: 'chair',
    name: 'Chair',
    ...hale,
    quantity: 2,
    trade_price_cents: 90_000,
    purchase_order_id: 'po-old',
    purchase_order: { id: 'po-old', vendor_id: 'vendor-hale', status: 'sent' },
  },
};

function StandInUnfold({ row }: { row: Row }) {
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const po = row.item.purchase_order ?? null;
  return (
    <div data-testid="unfold">
      <button type="button" onClick={() => setAssistantOpen(true)}>
        Order with Assistant
      </button>
      {assistantOpen && <div role="dialog" aria-label="Order Assistant" />}
      {po && (
        <button type="button" onClick={() => setPreviewOpen(true)}>
          Preview & send
        </button>
      )}
      {previewOpen && <div role="dialog" aria-label="PO preview" />}
    </div>
  );
}

function renderReading(rows: Row[]) {
  return (
    <MakerReadingTable<Row>
      rows={rows}
      canSeeMargin={false}
      wordFor={() => 'Selected'}
      openLineId="sofa"
      onToggleLine={jest.fn()}
      renderUnfold={(row) => <StandInUnfold row={row} />}
    />
  );
}

describe('MakerReadingTable — an open unfold survives ordering its line', () => {
  it('keeps the Order Assistant open when the line moves onto its new PO, then opens the preview', () => {
    const { rerender } = render(renderReading([chair, sofa(false)]));
    const unfold = screen.getByTestId('unfold');

    fireEvent.click(screen.getByRole('button', { name: 'Order with Assistant' }));
    expect(screen.getByRole('dialog', { name: 'Order Assistant' })).toBeInTheDocument();
    expect(screen.queryByText('Not yet ordered')).toBeInTheDocument();

    // The draft PO lands: the refetch moves the sofa from "not yet ordered"
    // onto its own purchase order within the same maker.
    rerender(renderReading([chair, sofa(true)]));

    expect(screen.queryByText('Not yet ordered')).not.toBeInTheDocument();
    expect(screen.getByTestId('unfold')).toBe(unfold);
    expect(screen.getByRole('dialog', { name: 'Order Assistant' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Preview & send' }));
    expect(screen.getByRole('dialog', { name: 'PO preview' })).toBeInTheDocument();
  });
});
