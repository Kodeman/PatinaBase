import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { EditableMoodBoardItem } from '@patina/types';
import { BoardPromoteAllPanel } from '../board-promote-all-panel';

const promoteMutateAsync = jest.fn();

jest.mock('@patina/supabase', () => ({
  usePromoteBoardReferenceToSelection: () => ({
    mutateAsync: promoteMutateAsync,
    isPending: false,
  }),
}));

function pin(overrides: Partial<EditableMoodBoardItem> = {}): EditableMoodBoardItem {
  return {
    id: 'pin-1',
    type: 'product',
    x: 0,
    y: 0,
    width: 100,
    data: { name: 'Oak chair' },
    ...overrides,
  };
}

beforeEach(() => {
  promoteMutateAsync.mockReset();
  promoteMutateAsync.mockResolvedValue({ outcome: 'created', selectionId: 'selection-1' });
});

describe('BoardPromoteAllPanel (DV3)', () => {
  it('renders nothing when there is nothing to promote', () => {
    const { container } = render(
      <BoardPromoteAllPanel
        projectId="project-1"
        scopeRoomId={null}
        items={[pin({ projectFfeItemId: 'ffe-1' })]}
        justMaterialized={false}
        onDismissJustMaterialized={jest.fn()}
        onPromoted={jest.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows just ONE unpromoted pin right after materialization (one-shot)', () => {
    render(
      <BoardPromoteAllPanel
        projectId="project-1"
        scopeRoomId={null}
        items={[pin({ id: 'pin-1' })]}
        justMaterialized
        onDismissJustMaterialized={jest.fn()}
        onPromoted={jest.fn()}
      />,
    );
    expect(
      screen.getByText("1 piece from this template aren't in the project selection yet"),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Promote all 1 pieces' })).toBeInTheDocument();
  });

  it('stays hidden for a single leftover pin once the materialization moment has passed', () => {
    const { container } = render(
      <BoardPromoteAllPanel
        projectId="project-1"
        scopeRoomId={null}
        items={[pin({ id: 'pin-1' })]}
        justMaterialized={false}
        onDismissJustMaterialized={jest.fn()}
        onPromoted={jest.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('stays reachable later once >=2 unpromoted promotable pins remain', () => {
    render(
      <BoardPromoteAllPanel
        projectId="project-1"
        scopeRoomId={null}
        items={[pin({ id: 'pin-1' }), pin({ id: 'pin-2', data: { name: 'Linen swatch' } })]}
        justMaterialized={false}
        onDismissJustMaterialized={jest.fn()}
        onPromoted={jest.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Promote all 2 pieces' })).toBeInTheDocument();
  });

  it('ignores client-verdict state entirely — every owner-linked product/capture pin counts, not just approved ones', () => {
    render(
      <BoardPromoteAllPanel
        projectId="project-1"
        scopeRoomId={null}
        items={[
          pin({ id: 'pin-1', type: 'capture' }),
          pin({ id: 'pin-2', type: 'note', data: { name: 'A note' } }),
          pin({ id: 'pin-3' }),
        ]}
        justMaterialized
        onDismissJustMaterialized={jest.fn()}
        onPromoted={jest.fn()}
      />,
    );
    // 2 of 3 are product/capture pins; the note is never promotable.
    expect(screen.getByRole('button', { name: 'Promote all 2 pieces' })).toBeInTheDocument();
  });

  it('promotes every eligible pin sequentially, dismisses the one-shot banner, and reports aggregate failures', async () => {
    promoteMutateAsync.mockImplementation((args: { boardItemId: string }) => {
      if (args.boardItemId === 'pin-1') {
        return Promise.reject(new Error('Vendor lookup failed for this pin.'));
      }
      return Promise.resolve({ outcome: 'created', selectionId: 'selection-2' });
    });
    const onPromoted = jest.fn();
    const onDismiss = jest.fn();
    render(
      <BoardPromoteAllPanel
        projectId="project-1"
        scopeRoomId="room-1"
        items={[
          pin({ id: 'pin-1', data: { name: 'Failing chair' } }),
          pin({ id: 'pin-2', data: { name: 'Succeeding lamp' } }),
        ]}
        justMaterialized
        onDismissJustMaterialized={onDismiss}
        onPromoted={onPromoted}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Promote all 2 pieces' }));
    await waitFor(() => expect(promoteMutateAsync).toHaveBeenCalledTimes(2));

    expect(promoteMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        boardItemId: 'pin-2',
        assignmentScope: 'room',
        roomId: 'room-1',
        disposition: 'candidate',
        duplicateMode: 'reuse',
      }),
    );
    expect(onPromoted).toHaveBeenCalledWith('pin-2', 'selection-2');
    expect(onPromoted).not.toHaveBeenCalledWith('pin-1', expect.anything());

    const alert = await screen.findByText(/could not be promoted/i);
    expect(alert).toHaveTextContent('1 of 2 could not be promoted: Failing chair');
    // The batch still ran to completion — dismiss fires once the run settles.
    expect(onDismiss).toHaveBeenCalled();
  });

  it('the caller may explicitly dismiss the one-shot banner without running a promote', () => {
    const onDismiss = jest.fn();
    render(
      <BoardPromoteAllPanel
        projectId="project-1"
        scopeRoomId={null}
        items={[pin({ id: 'pin-1' }), pin({ id: 'pin-2' })]}
        justMaterialized
        onDismissJustMaterialized={onDismiss}
        onPromoted={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(promoteMutateAsync).not.toHaveBeenCalled();
  });
});
