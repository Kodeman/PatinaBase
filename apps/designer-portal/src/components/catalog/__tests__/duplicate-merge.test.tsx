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
/** The products rows useProduct answers with, by id (layer, studio, merge facts). */
let mockProducts: Record<string, Record<string, unknown>> = {};

jest.mock('@patina/supabase/hooks', () => ({
  useProduct: (id: string) => ({ data: id ? mockProducts[id] : undefined }),
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
  const studioRow = (id: string, name: string) => ({
    id,
    name,
    layer: 'studio',
    studio_id: 'studio-1',
    merged_into_id: null,
    deleted_at: null,
  });
  mockProducts = {
    [KEEP_ID]: studioRow(KEEP_ID, 'Ledge Bed'),
    'prod-dup': studioRow('prod-dup', 'Ledge Bed (copy)'),
  };
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
    // T-55b (F10): the merge asks first, in the page.
    expect(mockMergeMutateAsync).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'MERGE' }));

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
    fireEvent.click(screen.getByRole('button', { name: 'MERGE' }));

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'A line uses a configuration of this product, so it cannot merge.',
          variant: 'error',
        }),
      ),
    );
  });

  it('asks in the page, naming both products, and merges nothing until confirmed (T-55b, F10)', () => {
    const confirmSpy = jest.spyOn(window, 'confirm');
    openPanel();

    fireEvent.click(screen.getByRole('button', { name: 'MERGE INTO THIS ONE' }));
    const question = screen.getByRole('group', { name: 'Confirm the merge' });
    expect(question).toHaveTextContent('Merge “Ledge Bed (copy)” into “Ledge Bed”?');
    expect(question).toHaveTextContent('The merge cannot be undone.');
    expect(screen.getByRole('button', { name: 'KEEP BOTH' })).toHaveFocus();
    expect(confirmSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'KEEP BOTH' }));
    expect(screen.queryByRole('group', { name: 'Confirm the merge' })).toBeNull();
    expect(screen.getByRole('button', { name: 'MERGE INTO THIS ONE' })).toHaveFocus();
    expect(mockMergeMutateAsync).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it.each([
    ['a catalog-layer duplicate', { layer: 'catalog', studio_id: null }],
    ['a duplicate in another studio', { studio_id: 'studio-2' }],
    ['a duplicate already merged', { merged_into_id: 'prod-other' }],
    ['a removed duplicate', { deleted_at: '2026-10-01T00:00:00Z' }],
  ])('does not offer the merge for %s, which the server refuses (00753)', (_label, facts) => {
    mockProducts['prod-dup'] = { ...mockProducts['prod-dup'], ...facts };
    openPanel();
    expect(screen.queryByRole('button', { name: 'MERGE INTO THIS ONE' })).toBeNull();
  });

  it('does not offer the merge when the product kept is not a studio product', () => {
    mockProducts[KEEP_ID] = { ...mockProducts[KEEP_ID], layer: 'catalog', studio_id: null };
    openPanel();
    expect(screen.queryByRole('button', { name: 'MERGE INTO THIS ONE' })).toBeNull();
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
