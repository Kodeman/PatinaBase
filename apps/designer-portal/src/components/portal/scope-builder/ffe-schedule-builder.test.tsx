import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ItemRow } from './ffe-schedule-builder';

const removeItemMutate = jest.fn(
  (_variables: unknown, options?: { onSuccess?: () => void }) => {
    options?.onSuccess?.();
  },
);

jest.mock('@/hooks/use-proposals', () => ({
  useRemoveProposalItem: () => ({ mutate: removeItemMutate, isPending: false }),
}));

jest.mock('@/components/portal/ffe/ffe-item-card', () => ({
  FFEItemCard: ({ actions }: { actions: React.ReactNode }) => <div>{actions}</div>,
}));

describe('FF&E drafting facet reconciliation', () => {
  it('invalidates the exact drafting summary after an individual line deletion', async () => {
    const queryClient = new QueryClient();
    const invalidate = jest
      .spyOn(queryClient, 'invalidateQueries')
      .mockResolvedValue(undefined);

    render(
      <QueryClientProvider client={queryClient}>
        <ItemRow
          item={
            {
              id: 'item-1',
              name: 'Lounge chair',
              item_type: 'fixed',
              quantity: 1,
              unit_price: 120000,
              doc_code: null,
              vendor_name: null,
              ffe_category: null,
              lead_time_weeks: null,
            } as never
          }
          proposalId="proposal-1"
          rooms={[]}
          categories={[]}
          categoryLookup={new Map()}
          isEditing={false}
          onStartEdit={jest.fn()}
          onStopEdit={jest.fn()}
        />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove item' }));

    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ['drafting-facets', 'proposal-1'],
      }),
    );
  });
});
