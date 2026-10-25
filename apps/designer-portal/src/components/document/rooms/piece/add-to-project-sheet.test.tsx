import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const place = jest.fn();
const push = jest.fn();
let params: URLSearchParams;

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => params,
}));

jest.mock('@patina/supabase', () => ({
  useProjects: () => ({
    data: [
      { id: 'project-2', name: 'Other', status: 'active' },
      { id: 'project-1', name: 'Lake house', status: 'active' },
    ],
    isLoading: false,
  }),
}));

jest.mock('@/hooks/use-place-in-document', () => ({
  usePlaceInDocument: () => ({ mutateAsync: place }),
}));
jest.mock('@/lib/analytics/events', () => ({
  productEvents: { addToProject: jest.fn() },
}));
jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));
jest.mock('@/lib/help-system/open-help', () => ({ openHelp: jest.fn() }));

import { AddToProjectSheet } from './add-to-project-sheet';

describe('Piece AddToProjectSheet', () => {
  beforeEach(() => {
    place.mockReset();
    push.mockReset();
    params = new URLSearchParams('projectId=project-1&roomId=room-1&boardId=board-1');
    params.set('returnTo', '/doc/project-1#project-ffe');
  });

  it('carries routing context, explicit duplicate intent, and exact outcome', async () => {
    place.mockResolvedValue({ outcome: 'reused', selectionId: 'selection-1' });
    const onAdded = jest.fn();
    render(
      <AddToProjectSheet
        open
        onClose={jest.fn()}
        piece={{ id: 'product-1', name: 'Oak chair' }}
        onAdded={onAdded}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create separate requirement' }));
    fireEvent.click(screen.getByRole('button', { name: /Lake house/i }));

    await waitFor(() => expect(place).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      assignmentScope: 'room',
      roomId: 'room-1',
      boardId: 'board-1',
      duplicateMode: 'create',
      idempotencyKey: expect.any(String),
    })));
    expect(onAdded).toHaveBeenCalledWith('Lake house', 'Reused selection');
    expect(push).toHaveBeenCalledWith('/doc/project-1?ffeItemId=selection-1#project-ffe');
  });

  it('retries the same configured request and returns to one sheet line owner', async () => {
    params.set('returnTo', '/doc/project-1?unfold=pieces&lens=rough&room=room-1&line=old&ffeItemId=old&land=region:ffe#project-ffe');
    place.mockRejectedValueOnce(new Error('Response lost'))
      .mockResolvedValueOnce({ outcome: 'reused', selectionId: 'selection-1' });
    render(<AddToProjectSheet open onClose={jest.fn()}
      piece={{ id: 'product-1', name: 'Oak chair' }} configurationId="config-1" onAdded={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Lake house/i }));
    await screen.findByText('Response lost');
    expect(push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Lake house/i }));
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    expect(place.mock.calls[1][0]).toEqual(place.mock.calls[0][0]);
    expect(place.mock.calls[1][0]).toEqual(expect.objectContaining({ configurationId: 'config-1', roomId: 'room-1', boardId: 'board-1' }));
    const destination = new URL(push.mock.calls[0][0], 'http://localhost');
    expect(Object.fromEntries(destination.searchParams)).toEqual({ unfold: 'pieces', lens: 'spec', room: 'room-1', line: 'selection-1' });
    expect(destination.hash).toBe('#project-ffe');
  });
});
