import { act, fireEvent, render, screen } from '@testing-library/react';
import { DeliverablesEditor } from '../deliverables-editor';

const updateMutateAsync = jest.fn();

const deliverable = {
  id: 'deliverable-1',
  phase_id: 'phase-1',
  label: 'Floor plan',
  description: null,
  is_required: true,
  sort_order: 0,
  completed_at: null,
  completed_by: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

jest.mock('@patina/supabase', () => ({
  usePhaseDeliverables: () => ({ data: [deliverable], isLoading: false }),
  useAddDeliverable: () => ({ mutate: jest.fn(), isPending: false }),
  useUpdateDeliverable: () => ({
    mutate: jest.fn(),
    mutateAsync: updateMutateAsync,
  }),
  useToggleDeliverableCompleted: () => ({ mutate: jest.fn() }),
  useReorderDeliverables: () => ({ mutate: jest.fn() }),
  useDeleteDeliverable: () => ({ mutate: jest.fn(), isPending: false }),
}));

jest.mock('@patina/design-system', () => ({
  DragDropContext: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SortableList: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  useSortableItem: () => ({
    setNodeRef: jest.fn(),
    style: {},
    attributes: {},
    listeners: {},
  }),
  reorderItems: (items: unknown[]) => items,
}));

describe('DeliverablesEditor autosave integrity', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    updateMutateAsync.mockReset();
    updateMutateAsync.mockResolvedValue({});
  });

  afterEach(() => jest.useRealTimers());

  it('flushes the final label when the editor unmounts before debounce', async () => {
    const { unmount } = render(<DeliverablesEditor phaseId="phase-1" />);

    fireEvent.change(screen.getByDisplayValue('Floor plan'), {
      target: { value: 'Final floor plan' },
    });
    unmount();
    await act(async () => Promise.resolve());

    expect(updateMutateAsync).toHaveBeenCalledWith({
      deliverableId: 'deliverable-1',
      phaseId: 'phase-1',
      updates: { label: 'Final floor plan' },
    });
  });
});
