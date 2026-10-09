/**
 * US-21 T-53 (D11, S5): a catalog duplicate merges into the product the panel
 * is on, through useMergeStudioProduct (merge_studio_product, 00753). The
 * hard delete is retired; a referenced product says the merge sentence.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockMergeMutateAsync = jest.fn();
const mockLegacyMerge = jest.fn();
const mockRefetch = jest.fn();
const mockToast = jest.fn();
let mockCheckResult: Record<string, unknown> | undefined;

jest.mock('@patina/supabase/hooks', () => ({
  useDuplicateCheck: () => ({
    data: mockCheckResult,
    isLoading: false,
    error: null,
    refetch: mockRefetch,
  }),
  useDismissDuplicate: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useMarkAsDuplicate: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useMergeStudioProduct: () => ({ mutateAsync: mockMergeMutateAsync, isPending: false }),
  // The media-service merge the panel used before D11; it must stay unused.
  useMergeDuplicates: () => ({ mutateAsync: mockLegacyMerge, isPending: false }),
}));

jest.mock('@patina/design-system', () => ({
  ...jest.requireActual('@patina/design-system'),
  toast: (...args: unknown[]) => mockToast(...args),
}));

import { DuplicateDetectionPanel } from '../duplicate-detection-panel';
import * as productHooks from '@/hooks/use-products';

const KEEP_ID = 'prod-keep';

function match(assetId: string, product?: { id: string; name: string }) {
  return {
    assetId,
    similarity: 98,
    phash: 'abc',
    product: product && {
      ...product,
      images: [],
      vendorName: 'Hollis',
      priceRetail: 1200,
    },
  };
}

function openPanel() {
  render(<DuplicateDetectionPanel productId={KEEP_ID} productName="Ledge Bed" />);
  fireEvent.click(screen.getByRole('button', { name: /check for duplicates/i }));
}

beforeEach(() => {
  mockMergeMutateAsync.mockReset();
  mockLegacyMerge.mockReset();
  mockRefetch.mockReset();
  mockToast.mockReset();
  mockCheckResult = {
    isDuplicate: true,
    phash: 'abc',
    exactMatches: [match('asset-dup', { id: 'prod-dup', name: 'Ledge Bed (copy)' })],
    similarMatches: [
      match('asset-only'),
      match('asset-self', { id: KEEP_ID, name: 'Ledge Bed' }),
    ],
  };
});

describe('duplicate merge (T-53)', () => {
  it('MERGE INTO THIS ONE merges the duplicate into the product the panel is on', async () => {
    mockMergeMutateAsync.mockResolvedValue({
      fromId: 'prod-dup',
      intoId: KEEP_ID,
      lines: 3,
      boardItems: 1,
      projectProducts: 1,
      earlierMerges: 0,
    });
    openPanel();

    const acts = screen.getAllByRole('button', { name: 'MERGE INTO THIS ONE' });
    // Only the match that is another catalog product can merge: not an
    // asset with no product, and never the product into itself.
    expect(acts).toHaveLength(1);
    fireEvent.click(acts[0]);

    await waitFor(() =>
      expect(mockMergeMutateAsync).toHaveBeenCalledWith({
        fromProductId: 'prod-dup',
        intoProductId: KEEP_ID,
      }),
    );
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Merged' })),
    );
    expect(mockRefetch).toHaveBeenCalled();
    expect(mockLegacyMerge).not.toHaveBeenCalled();
  });

  it("prints the RPC's refusal sentence when the merge is refused", async () => {
    mockMergeMutateAsync.mockRejectedValue({
      message: 'A line uses a configuration of this product, so it cannot merge.',
    });
    openPanel();

    fireEvent.click(screen.getByRole('button', { name: 'MERGE INTO THIS ONE' }));

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'A line uses a configuration of this product, so it cannot merge.',
          variant: 'error',
        }),
      ),
    );
  });

  it('a referenced product refuses deletion with the merge sentence', () => {
    openPanel();

    expect(productHooks.REFERENCED_PRODUCT_DELETE_REFUSAL).toBe(
      "A product on a line can't be deleted. Merge it into the one you keep.",
    );
    expect(screen.getByText(productHooks.REFERENCED_PRODUCT_DELETE_REFUSAL)).toBeInTheDocument();
    // No delete act anywhere on the panel; DeleteProductDialog is never wired.
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull();
  });

  it('the hard delete hook is retired', () => {
    expect((productHooks as Record<string, unknown>).useDeleteProduct).toBeUndefined();
  });
});
