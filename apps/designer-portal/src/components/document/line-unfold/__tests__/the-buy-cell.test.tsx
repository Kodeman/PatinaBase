/**
 * US-19 FR2 511-R1 (SQ-517): where the buy is read-only (install mode), the
 * `Add the maker` landing still finds a maker field on its own line, and only
 * there. The trade cost stays read-only; a line on a PO changes its maker
 * through the PO.
 */
import { act, render, screen } from '@testing-library/react';

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));
jest.mock('@patina/supabase', () => {
  const idle = { mutateAsync: jest.fn(), isPending: false };
  return {
    useFindVendorMatch: () => idle,
    useResolveOrCreateVendor: () => idle,
    useSetFfeLineCommercials: () => idle,
    useVendors: () => ({ data: undefined }),
    useProductPrices: () => ({ data: undefined }),
  };
});
jest.mock('../../buying/com-piece', () => ({ ComPiece: () => null }));
jest.mock('../sample-request', () => ({ LineSamples: () => null }));

import { TheBuyCell, makerLandingPending } from '../the-buy-cell';

const LINE = {
  id: 'line-side-table',
  name: 'Side table',
  quantity: 1,
  vendor_id: null,
  vendor_name: null,
  purchase_order_id: null,
  trade_price_cents: null,
};

const land = (itemId: string) =>
  act(() => {
    window.dispatchEvent(
      new CustomEvent('document:focus-ffe-line', { detail: { itemId, cell: 'maker' } }),
    );
  });

const renderCell = (item: Record<string, unknown> = LINE) =>
  render(<TheBuyCell item={item} po={null} projectId="project-1" canEdit={false} />);

beforeEach(() => {
  makerLandingPending.itemId = null;
});

describe('TheBuyCell maker landing (511-R1)', () => {
  it('reads Not recorded until a landing names this line, then offers the maker field', () => {
    renderCell();
    expect(screen.getByTestId('line-commercials')).toHaveTextContent('Maker Not recorded');
    expect(screen.queryByRole('combobox', { name: 'Maker' })).toBeNull();

    land('line-side-table');
    expect(screen.getByRole('combobox', { name: 'Maker' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Trade cost' })).toBeNull();
  });

  it("a landing on another line leaves this one's buy read-only", () => {
    renderCell();
    land('line-other');
    expect(screen.queryByRole('combobox', { name: 'Maker' })).toBeNull();
  });

  it('a cell mounting after the landing named it opens on the maker field, once', () => {
    makerLandingPending.itemId = 'line-side-table';
    renderCell();
    expect(screen.getByRole('combobox', { name: 'Maker' })).toBeInTheDocument();
    expect(makerLandingPending.itemId).toBeNull();
  });

  it('a line on a purchase order never unlocks its maker here', () => {
    renderCell({ ...LINE, purchase_order_id: 'po-1' });
    land('line-side-table');
    expect(screen.queryByRole('combobox', { name: 'Maker' })).toBeNull();
  });
});
