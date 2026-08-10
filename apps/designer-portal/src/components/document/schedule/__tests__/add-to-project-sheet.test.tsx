import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AddToProjectSheet, openAddToProject } from '../add-to-project-sheet';

const push = jest.fn();
const placeProduct = jest.fn();
const createNeed = jest.fn();

jest.mock('next/navigation', () => ({
  usePathname: () => '/doc/project-1',
  useRouter: () => ({ push }),
}));

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));
jest.mock('@/lib/analytics/ffe-events', () => ({
  ffeEvents: {
    entranceOpened: jest.fn(), routingChosen: jest.fn(), placementCompleted: jest.fn(), failed: jest.fn(),
  },
}));
jest.mock('@/lib/help-system/open-help', () => ({ openHelp: jest.fn() }));

jest.mock('@patina/supabase', () => ({
  usePlaceProductInProjectV2: () => ({ mutateAsync: placeProduct, isPending: false }),
  useCreateNamedProjectNeed: () => ({ mutateAsync: createNeed, isPending: false }),
}));

jest.mock('@/components/portal/proposals/product-picker-modal', () => ({
  ProductPickerModal: ({ open, initialTab, onPick }: {
    open: boolean;
    initialTab: string;
    onPick: (value: Record<string, unknown>) => void;
  }) => open ? (
    <div data-testid="picker" data-initial-tab={initialTab}>
      <button type="button" onClick={() => onPick({ productId: 'product-1', name: 'Oak chair' })}>
        Pick Oak chair
      </button>
    </div>
  ) : null,
}));

const boards = [
  { id: 'board-wide', name: 'Project board', status: 'active', project_room_id: null },
] as any;

function renderSheet() {
  render(
    <AddToProjectSheet
      projectId="project-1"
      projectName="Lake house"
      rooms={[{ id: 'room-1', name: 'Living room' }]}
      boards={boards}
      placeholders={[{ id: 'placeholder-1', name: 'Reading chair' }]}
    />,
  );
  act(() => openAddToProject('section'));
}

describe('AddToProjectSheet', () => {
  beforeEach(() => {
    push.mockReset();
    placeProduct.mockReset();
    createNeed.mockReset();
  });

  it('opens the guarded URL intake on the captures tab', () => {
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: /Paste a product link/i }));
    expect(screen.getByTestId('picker')).toHaveAttribute('data-initial-tab', 'captures');
  });

  it('keeps one idempotency key across an ambiguous retry and sends the SQL duplicate enum', async () => {
    placeProduct
      .mockRejectedValueOnce(new Error('connection closed'))
      .mockResolvedValueOnce({
        outcome: 'created', selectionId: 'selection-1', threadId: 'thread-1', placementId: null,
      });
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: /Browse the Library/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Pick Oak chair' }));
    fireEvent.click(screen.getByRole('button', { name: 'Separate need' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add selection' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Add selection' }));

    await waitFor(() => expect(placeProduct).toHaveBeenCalledTimes(2));
    expect(placeProduct.mock.calls[0][0].duplicateMode).toBe('create');
    expect(placeProduct.mock.calls[1][0].idempotencyKey)
      .toBe(placeProduct.mock.calls[0][0].idempotencyKey);
  });

  it('fills an explicit placeholder and reports the exact filled outcome', async () => {
    placeProduct.mockResolvedValue({
      outcome: 'filled', selectionId: 'placeholder-1', threadId: 'thread-1', placementId: null,
    });
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: /Browse the Library/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Pick Oak chair' }));
    fireEvent.change(screen.getByLabelText('Optional placeholder to fill'), {
      target: { value: 'placeholder-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add selection' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Filled placeholder · Oak chair');
    expect(placeProduct).toHaveBeenCalledWith(expect.objectContaining({
      placeholderSelectionId: 'placeholder-1',
    }));
  });

  it('is honest about deferred project staging and permits a named need board placement', async () => {
    createNeed.mockResolvedValue({
      outcome: 'created', selectionId: 'selection-2', threadId: 'thread-2', placementId: 'placement-2',
    });
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: /Import a schedule/i }));
    expect(screen.getByRole('alert')).toHaveTextContent('No selections were created');
    expect(push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Name a need/i }));
    fireEvent.change(screen.getByPlaceholderText('Pair of reading chairs'), { target: { value: 'Side table' } });
    fireEvent.change(screen.getByLabelText('Optional board placement'), { target: { value: 'board-wide' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add the need' }));
    await waitFor(() => expect(createNeed).toHaveBeenCalledWith(expect.objectContaining({
      boardId: 'board-wide',
      assignmentScope: 'unassigned',
      source: 'named-need',
      itemType: 'tbd',
    })));
  });

  it('regenerates idempotency only when the logical request changes', async () => {
    placeProduct.mockRejectedValue(new Error('connection closed'));
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: /Browse the Library/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Pick Oak chair' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add selection' }));
    await screen.findByRole('alert');
    const first = placeProduct.mock.calls[0][0].idempotencyKey;
    fireEvent.click(screen.getByRole('button', { name: 'Separate need' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add selection' }));
    await waitFor(() => expect(placeProduct).toHaveBeenCalledTimes(2));
    expect(placeProduct.mock.calls[1][0].idempotencyKey).not.toBe(first);
    expect(placeProduct.mock.calls[1][0]).toMatchObject({
      duplicateMode: 'create',
      itemType: 'fixed',
    });
  });
});
