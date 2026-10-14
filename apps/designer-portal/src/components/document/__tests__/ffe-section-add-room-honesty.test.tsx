/**
 * US-34 F15a: adding a room keeps the typed name and budget in the inputs until
 * the write succeeds. While it is pending the act reads "Adding…"; a refused
 * write keeps the words and shows one inline `role="alert"` line.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';

type MutateOptions = { onSuccess?: () => void; onError?: (e: Error) => void };

const mockAddRoom = {
  mutate: jest.fn<void, [unknown, MutateOptions]>(),
  isPending: false,
  pending: [] as { id: string; name: string; budgetCents?: number | null; sortOrder: number }[],
};

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: {
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
    regionFolded: jest.fn(),
  },
}));

jest.mock('@/lib/help-system/open-help', () => ({ openHelp: jest.fn() }));

jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock('@/components/document/buying/install-manifest', () => ({ InstallManifest: () => null }));

jest.mock('@patina/supabase', () => ({
  useProjectRoomPlacements: () => ({ data: [] }),
  useProjectPalettes: () => ({ data: [] }),
  useProcurementDrafts: () => ({ data: [] }),
  useStudioPurchases: () => ({ data: [] }),
  useProjectPoCostLines: () => ({ data: [] }),
  useUnresolvedProcurementExceptions: () => ({ data: [] }),
  useProjectFFEItems: () => ({ data: [], isLoading: false, isError: false, refetch: jest.fn() }),
  useProjectFfeReadiness: () => ({ data: [] }),
  useProjectOwnedBoards: () => ({ data: [], isLoading: false }),
  useFfeInvoiceCoverage: () => ({ data: {} }),
}));

jest.mock('../schedule/add-to-project-sheet', () => ({
  AddToProjectSheet: () => null,
  openAddToProject: jest.fn(),
}));

let mockRooms: { id: string; project_id: string; name: string; budget_cents: number; sort_order: number }[] = [];

jest.mock('@/hooks/use-document-rooms', () => ({
  useDocumentRooms: () => ({ data: mockRooms }),
  useAddDocumentRoom: () => mockAddRoom,
}));

jest.mock('@/hooks/use-commercial-documents', () => ({
  commercialDocumentKeys: { budget: (id: string) => ['working-budget', id] },
  useProjectInstruments: () => ({ data: [] }),
  useTradeScopes: () => ({ data: [], isPending: false }),
  useProjectBillingAuthority: () => ({ data: null }),
  useWorkingBudget: () => ({ isLoading: false, data: null }),
  useReleaseForAuthorization: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useSendFurnishingsAuthorization: () => ({ mutateAsync: jest.fn(), isPending: false }),
  usePublishBudgetCheckpoint: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useOverrideBudgetCheckpoint: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (key: string) => ({ value: key === 'optimistic-ink' }),
}));

jest.mock('@/components/portal/ffe/stages', () => ({
  STAGE_CONFIG: new Proxy(
    {},
    {
      get: (_target, key: string) => ({
        key,
        label: key.charAt(0).toUpperCase() + key.slice(1),
        color: 'var(--text-muted)',
      }),
    },
  ),
}));

jest.mock('../accounts/invoice-overlays', () => ({ openInvoiceComposer: jest.fn() }));
jest.mock('../work-block', () => ({ WorkBlock: () => null }));
jest.mock('../folio-strip', () => ({ FolioStrip: () => null }));
jest.mock('../strata-mark', () => ({ StrataMark: () => null }));
jest.mock('../strata-mini-rule', () => ({ StrataMiniRule: () => null }));
jest.mock('../line-unfold', () => ({ LineUnfold: () => null }));

jest.mock('@/hooks/use-section-work', () => {
  const actual = jest.requireActual('@/hooks/use-section-work');
  const idle = { mutate: jest.fn(), mutateAsync: jest.fn(), isPending: false };
  return {
    ...actual,
    useSectionTasks: () => ({ data: [], isLoading: false, isError: false, refetch: jest.fn() }),
    useSectionGates: () => ({ data: [], isLoading: false, isError: false, refetch: jest.fn() }),
    useSectionLoggedMinutes: () => ({ data: 0 }),
    useCreateSectionTask: () => idle,
    useToggleSectionTask: () => idle,
    useRequestSectionGate: () => idle,
  };
});

import { FFESection } from '../ffe-section';
import { __setDensityForTest } from '@/hooks/use-lens-density';

beforeEach(() => {
  __setDensityForTest('full');
  mockAddRoom.mutate.mockReset();
  mockAddRoom.isPending = false;
  mockAddRoom.pending = [];
  mockRooms = [];
});
afterEach(() => {
  __setDensityForTest(undefined);
});

const openAndType = () => {
  const view = render(<FFESection projectId="project-1" projectName="Ellsworth" mode="project" />);
  fireEvent.click(screen.getByRole('button', { name: 'Add a room' }));
  fireEvent.change(screen.getByPlaceholderText('Room name'), { target: { value: 'Library' } });
  fireEvent.change(screen.getByLabelText('Budget allocation (dollars)'), {
    target: { value: '1200' },
  });
  return view;
};

describe('F15a — adding a room never loses the typed words', () => {
  it('renders every optimistic room as a pending ghost row', () => {
    mockAddRoom.pending = [
      { id: 'client-room-1', name: 'Library', budgetCents: 120000, sortOrder: 0 },
      { id: 'client-room-2', name: 'Dining', budgetCents: 0, sortOrder: 1 },
    ];
    render(<FFESection projectId="project-1" projectName="Ellsworth" mode="project" />);

    expect(screen.getByText('Library')).toBeInTheDocument();
    expect(screen.getByText('Dining')).toBeInTheDocument();
    expect(screen.getAllByRole('status').some((node) => node.textContent === 'Adding…')).toBe(true);
  });

  it('a slow create shows one "Adding…" row with no acts, then one normal row after the receipt (SQ-1001 #6)', () => {
    const library = { id: 'client-room-1', name: 'Library', budgetCents: 0, sortOrder: 0 };
    const written = { id: library.id, project_id: 'project-1', name: 'Library', budget_cents: 0, sort_order: 0 };
    const addingStatuses = () =>
      screen.queryAllByRole('status').filter((node) => node.textContent === 'Adding…');
    const expectOnlyTheGhost = () => {
      expect(screen.getAllByText('Library')).toHaveLength(1);
      expect(addingStatuses()).toHaveLength(1);
      expect(screen.getByText('Library').closest('[aria-busy="true"]')).not.toBeNull();
      expect(screen.queryByRole('button', { name: 'Library' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Add room selection' })).not.toBeInTheDocument();
      expect(screen.queryByText('Edit room selections')).not.toBeInTheDocument();
    };

    mockAddRoom.pending = [library];
    const view = render(<FFESection projectId="project-1" projectName="Ellsworth" mode="project" />);
    expectOnlyTheGhost();

    // The list can read the written room before its receipt arrives: still one row.
    mockRooms = [written];
    view.rerender(<FFESection projectId="project-1" projectName="Ellsworth" mode="project" />);
    expectOnlyTheGhost();

    mockAddRoom.pending = [];
    view.rerender(<FFESection projectId="project-1" projectName="Ellsworth" mode="project" />);
    expect(screen.getAllByText('Library')).toHaveLength(1);
    expect(addingStatuses()).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Library' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Add room selection' })).toBeEnabled();
  });

  it('keeps the typed name and budget after a forced failure and says so inline', () => {
    openAndType();
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(mockAddRoom.mutate).toHaveBeenCalledTimes(1);
    expect(mockAddRoom.mutate.mock.calls[0][0]).toEqual({ name: 'Library', budgetCents: 120000 });
    // Nothing is cleared before the server answers.
    expect(screen.getByPlaceholderText('Room name')).toHaveValue('Library');

    act(() => {
      mockAddRoom.mutate.mock.calls[0][1].onError?.(new Error('refused'));
    });

    expect(screen.getByPlaceholderText('Room name')).toHaveValue('Library');
    expect(screen.getByLabelText('Budget allocation (dollars)')).toHaveValue('1200');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t add the room');
  });

  it('reads "Adding…" while the write is pending', () => {
    mockAddRoom.isPending = true;
    openAndType();
    expect(screen.getByRole('button', { name: /Adding…/ })).toBeDisabled();
  });

  it('clears and closes only once the write succeeds', () => {
    openAndType();
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    act(() => {
      mockAddRoom.mutate.mock.calls[0][1].onSuccess?.();
    });
    expect(screen.queryByPlaceholderText('Room name')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add a room' })).toBeInTheDocument();
  });
});
