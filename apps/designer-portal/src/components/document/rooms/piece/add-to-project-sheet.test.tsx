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
  ...jest.requireActual('@/hooks/use-place-in-document'),
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

const fillIntent = {
  placeholderSelectionId: 'allowance-1', assignmentScope: 'throughout', roomId: null,
  quantity: 4, itemType: 'allowance', budgetMinCents: 20000, budgetMaxCents: 60000, disposition: 'selected',
};
function openSheet() {
  render(<AddToProjectSheet open onClose={jest.fn()} piece={{ id: 'product-1', name: 'Oak chair' }} onAdded={jest.fn()} />);
}
it('continues a selected four-unit allowance Fill on the originating project', async () => {
  params = new URLSearchParams({ projectId: 'project-1', assignmentScope: 'throughout', fill: JSON.stringify(fillIntent) });
  place.mockReset().mockResolvedValue({ outcome: 'filled', selectionId: 'allowance-1' });
  openSheet();
  fireEvent.click(screen.getByRole('button', { name: /Lake house/i }));
  await waitFor(() => expect(place).toHaveBeenCalledWith(expect.objectContaining({ fill: fillIntent, assignmentScope: 'throughout', roomId: null })));
});
it.each(['throughout', 'unassigned'])('keeps %s distinct with no room', async (assignmentScope) => {
  params = new URLSearchParams({ projectId: 'project-1', assignmentScope });
  place.mockReset().mockResolvedValue({ outcome: 'created', selectionId: 'new-1' });
  openSheet();
  fireEvent.click(screen.getByRole('button', { name: /Lake house/i }));
  await waitFor(() => expect(place).toHaveBeenCalledWith(expect.objectContaining({ assignmentScope, roomId: null })));
});
it('does not apply the originating Fill or Throughout scope to another project', async () => {
  params = new URLSearchParams({ projectId: 'project-1', assignmentScope: 'throughout', fill: JSON.stringify(fillIntent) });
  place.mockReset().mockResolvedValue({ outcome: 'created', selectionId: 'new-1' });
  openSheet();
  fireEvent.click(screen.getByRole('button', { name: /Other/i }));
  await waitFor(() => expect(place).toHaveBeenCalled());
  expect(place.mock.calls[0][0]).toMatchObject({ assignmentScope: 'unassigned', roomId: null });
  expect(place.mock.calls[0][0]).not.toHaveProperty('fill');
});
it('refuses malformed Fill rather than making an ordinary candidate', async () => {
  params = new URLSearchParams({ projectId: 'project-1', fill: '{bad' });
  place.mockReset();
  openSheet();
  fireEvent.click(screen.getByRole('button', { name: /Lake house/i }));
  await screen.findByText(/Fill context could not be read/);
  expect(place).not.toHaveBeenCalled();
});
it('returns a legacy Pieces detour to Spec at the placed ID rather than a stale line', async () => {
  params = new URLSearchParams({ projectId: 'project-1', returnTo: '/doc/project-1/pieces?lens=rough&line=stale#ffe' });
  place.mockReset().mockResolvedValue({ outcome: 'created', selectionId: 'new-1' });
  push.mockReset();
  openSheet();
  fireEvent.click(screen.getByRole('button', { name: /Lake house/i }));
  await waitFor(() => expect(push).toHaveBeenCalledWith('/doc/project-1/pieces?lens=spec&ffeItemId=new-1#ffe'));
});

it.each([['hold', 'Hold for review'], ['create', 'Create separate requirement']])('honors %s on the Fill target without a fill payload', async (duplicateMode, label) => {
  params = new URLSearchParams({ projectId: 'project-1', assignmentScope: 'throughout', fill: JSON.stringify(fillIntent) });
  place.mockReset().mockResolvedValue({ outcome: duplicateMode === 'hold' ? 'held' : 'created' });
  openSheet();
  fireEvent.click(screen.getByRole('button', { name: label }));
  fireEvent.click(screen.getByRole('button', { name: /Lake house/i }));
  await waitFor(() => expect(place).toHaveBeenCalled());
  expect(place.mock.calls[0][0]).toMatchObject({ duplicateMode, assignmentScope: 'throughout', roomId: null });
  expect(place.mock.calls[0][0]).not.toHaveProperty('fill');
});
it('refuses an empty Fill parameter instead of placing an ordinary candidate', async () => {
  params = new URLSearchParams({ projectId: 'project-1', fill: '' });
  place.mockReset();
  openSheet();
  fireEvent.click(screen.getByRole('button', { name: /Lake house/i }));
  await screen.findByText(/Fill context could not be read/);
  expect(place).not.toHaveBeenCalled();
});
