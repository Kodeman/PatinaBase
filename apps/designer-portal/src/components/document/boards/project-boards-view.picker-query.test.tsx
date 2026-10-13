/**
 * R16 — the boards page mounts the REAL create picker only while it is open,
 * so browsing a project's boards never asks for the studio's templates. The
 * picker's own `useBoardTemplates` call is the query observed here.
 */
import { fireEvent, render, screen } from '@testing-library/react';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/doc/eng-1/boards',
}));

jest.mock('@/hooks/use-document-state', () => ({
  useDocumentEngagement: () => ({
    isLoading: false,
    data: {
      kind: 'engagement',
      row: {
        engagement_kind: 'project',
        engagement_id: 'eng-1',
        project_id: 'proj-1',
        title: 'Vandersteen residence',
        active_section: 'project',
      },
    },
  }),
}));

const mockUseBoardTemplates = jest.fn((_studioId: string | null | undefined) => ({
  data: [],
  isLoading: false,
}));
const mutation = () => ({ mutateAsync: jest.fn(), isPending: false });
jest.mock('@patina/supabase', () => ({
  useProjectOwnedBoards: () => ({
    isLoading: false,
    data: [{ id: 'b1', name: 'Living room, warm', item_count: 7, status: 'active' }],
  }),
  useProjectBoards: () => ({ isLoading: false, data: [] }),
  useBoardReactionStatuses: () => new Map(),
  useOrganizations: () => ({ data: [{ id: 'studio-1', type: 'design_studio' }] }),
  useBoardTemplates: (studioId: string | null | undefined) => mockUseBoardTemplates(studioId),
  useUpsertBoard: () => mutation(),
  useCreateProjectBoard: () => mutation(),
  useMaterializeBoardTemplate: () => mutation(),
}));

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ value: false }),
}));

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

import { ProjectBoardsView } from './project-boards-view';

describe('the boards page create picker (R16)', () => {
  beforeEach(() => mockUseBoardTemplates.mockClear());

  it('makes no template query while the picker is closed, and asks once it opens', () => {
    render(<ProjectBoardsView routeId="eng-1" />);

    expect(screen.getByText('Living room, warm')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(mockUseBoardTemplates).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'New board' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(mockUseBoardTemplates).toHaveBeenCalledWith('studio-1');
  });
});
