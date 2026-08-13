import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const place = jest.fn();
const push = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(
    'projectId=project-1&roomId=room-1&boardId=board-1&returnTo=%2Fdoc%2Fproject-1%23project-ffe',
  ),
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
    fireEvent.click(screen.getByRole('button', { name: 'Separate need' }));
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
    expect(push).toHaveBeenCalledWith('/doc/project-1#project-ffe');
  });
});
