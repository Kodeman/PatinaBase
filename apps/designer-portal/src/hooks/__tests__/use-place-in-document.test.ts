import { createElement, type PropsWithChildren } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePlaceInDocument } from '../use-place-in-document';

const mockPlace = jest.fn();
jest.mock('@patina/supabase', () => ({
  usePlaceProductInProjectV2: () => ({ mutateAsync: mockPlace }),
}));

const request = {
  projectId: 'project-1',
  piece: { id: 'product-1', name: 'Configured chair' },
  configurationId: 'configuration-1',
  assignmentScope: 'room' as const,
  roomId: 'room-1',
  boardId: 'board-1',
  idempotencyKey: 'existing-placement-request',
};

function setup() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client }, children);
  return { ...renderHook(() => usePlaceInDocument(), { wrapper }), invalidate };
}

beforeEach(() => mockPlace.mockReset());

it('forwards the exact configuration, room, board and existing replay key to native V2 as a candidate', async () => {
  const receipt = { outcome: 'created', selectionId: 'selection-1' };
  mockPlace.mockResolvedValue(receipt);
  const { result, invalidate } = setup();
  await act(async () => {
    expect(await result.current.mutateAsync(request)).toEqual(receipt);
  });
  expect(mockPlace).toHaveBeenCalledWith({
    projectId: 'project-1', productId: 'product-1', name: 'Configured chair',
    itemType: 'fixed', configurationId: 'configuration-1',
    assignmentScope: 'room', roomId: 'room-1', boardId: 'board-1',
    disposition: 'candidate', duplicateMode: 'reuse',
    roleConfigurationIdentity: 'default', source: 'engine',
    idempotencyKey: 'existing-placement-request',
  });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['library-piece-usage'] });
});

it('preserves the caller replay key on retry after a lost response and returns the native reused identity', async () => {
  const receipt = { outcome: 'reused', selectionId: 'selection-1' };
  mockPlace.mockRejectedValueOnce(new Error('Response lost')).mockResolvedValueOnce(receipt);
  const { result, invalidate } = setup();
  await act(async () => {
    await expect(result.current.mutateAsync(request)).rejects.toThrow('Response lost');
  });
  expect(invalidate).not.toHaveBeenCalled();
  await act(async () => {
    expect(await result.current.mutateAsync(request)).toEqual(receipt);
  });
  expect(mockPlace.mock.calls[1][0]).toEqual(mockPlace.mock.calls[0][0]);
  expect(mockPlace).toHaveBeenCalledTimes(2);
});

it('does not silently replace an explicit duplicate choice or invent a configuration', async () => {
  mockPlace.mockResolvedValue({ outcome: 'held' });
  const { result } = setup();
  await act(async () => {
    await result.current.mutateAsync({
      projectId: request.projectId, piece: request.piece,
      duplicateMode: 'hold', idempotencyKey: 'hold-request',
    });
  });
  expect(mockPlace).toHaveBeenCalledWith(expect.objectContaining({
    duplicateMode: 'hold', configurationId: null, roomId: null,
    boardId: null, assignmentScope: 'unassigned', disposition: 'candidate',
  }));
});

it('fills the stable allowance through native V2 without candidate defaults replacing its intent', async () => {
  mockPlace.mockResolvedValue({ outcome: 'filled', selectionId: 'allowance-1' });
  const { result } = setup();
  const fill = {
    placeholderSelectionId: 'allowance-1', assignmentScope: 'throughout' as const, roomId: null,
    quantity: 4, itemType: 'allowance' as const, budgetMinCents: 20000, budgetMaxCents: 60000, disposition: 'selected' as const,
  };
  await act(async () => { await result.current.mutateAsync({ ...request, fill, duplicateMode: 'create' }); });
  expect(mockPlace).toHaveBeenCalledWith(expect.objectContaining({ ...fill, productId: request.piece.id, duplicateMode: 'reuse', configurationId: request.configurationId }));
  expect(mockPlace.mock.calls[0][0]).not.toHaveProperty('name');
});
