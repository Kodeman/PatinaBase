/** Canonical FF&E completeness and explicit local focus-return targets. */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

let mockAskThePaper = true;
let mockOneVoice = true;
let mockItems: Record<string, unknown>[] = [];
let mockQuery = { isPending: false, isFetching: false, isStale: false, error: null as Error | null };

// Job places have their own suite (destinations/__tests__).
jest.mock('@/components/document/destinations/use-job-places', () => ({
  useJobPlaces: () => ({
    organizationId: null,
    locations: [],
    jobLocationIds: new Set(),
    jobPlaces: [],
    studioAddress: undefined,
    siteAddress: null,
    isLoading: false,
    isError: false,
  }),
}));

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (flag: string) => ({
    value:
      flag === 'ask-the-paper'
        ? mockAskThePaper
        : flag === 'one-voice'
          ? mockOneVoice
          : false,
    isLoading: false,
  }),
}));

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

jest.mock('@/components/document/buying/install-manifest', () => ({
  InstallManifest: () => null,
}));

jest.mock('@/components/document/overlays/ask-maker-sheet', () => ({
  InstallReadingLine: () => null,
}));

jest.mock('@patina/supabase', () => ({
  inboxKeys: { unreadCount: () => ['inbox', 'unread-count'] },
  procurementUnreadCountKey: () => ['procurement-unread-count'],
  useProjectRoomPlacements: () => ({ data: [] }),
  useProjectPalettes: () => ({ data: [] }),
  useRemovedProjectLines: () => ({ data: [] }),
  useStartPurchaseOrderChange: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useFindVendorMatch: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useResolveOrCreateVendor: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useProcurementDrafts: () => ({ data: [] }),
  useStudioPurchases: () => ({ data: [] }),
  useProjectPoCostLines: () => ({ data: [] }),
  useUnresolvedProcurementExceptions: () => ({ data: [] }),
  useProjectFFEItems: () => ({
    data: mockQuery.isPending || (mockQuery.error && mockItems.length === 0) ? undefined : mockItems,
    ...mockQuery,
    isLoading: mockQuery.isPending,
    isError: !!mockQuery.error,
    refetch: jest.fn(),
  }),
  useProjectFfeReadiness: () => ({
    data: mockItems.map((item) => ({ selectionId: item.id, ready: true, missingFields: [] })),
    isLoading: false,
    isError: false,
  }),
  useProjectOwnedBoards: () => ({ data: [], isLoading: false }),
  useFfeInvoiceCoverage: () => ({ data: {} }),
}));

jest.mock('@/components/document/schedule/add-to-project-sheet', () => ({
  AddToProjectSheet: () => null,
  openAddToProject: jest.fn(),
}));

jest.mock('@/hooks/use-document-rooms', () => ({
  useDocumentRooms: () => ({ data: [] }),
  useAddDocumentRoom: () => ({ mutate: jest.fn() }),
}));

jest.mock('@/hooks/use-project-purchasing-agreement', () => ({
  useProjectPurchasingAgreement: () => ({ data: { state: 'missing' }, isPending: false, isError: false }),
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

jest.mock('@/components/document/accounts/invoice-overlays', () => ({
  openInvoiceComposer: jest.fn(),
}));
jest.mock('@/components/document/work-block', () => ({
  WorkBlock: ({ heading, tally }: { heading?: string; tally?: string }) => (
    <div data-testid="work-block" data-heading={heading ?? ''} data-tally={tally ?? ''} />
  ),
}));
jest.mock('@/components/document/folio-strip', () => ({ FolioStrip: () => null }));
jest.mock('@/components/document/strata-mark', () => ({ StrataMark: () => null }));
jest.mock('@/components/document/strata-mini-rule', () => ({ StrataMiniRule: () => null }));
jest.mock('@/components/document/line-unfold', () => ({ LineUnfold: () => null }));

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


import { __setDensityForTest } from '@/hooks/use-lens-density';
import { FFESection } from '@/components/document/ffe-section';
import { RecordAChangeSheet } from '@/components/document/overlays/record-a-change-sheet';
import { BuildRoom } from '../build-room';
import { LineQueryReading } from '../build-room-shell';
import { lineQueryState } from '../line-query';
jest.mock('@/components/document/overlays/amendment-sheet', () => ({ AmendmentSheet: () => null }));

jest.mock('@/hooks/use-document-state', () => ({
  useDocumentEngagement: () => ({ data: { kind: 'engagement', row: { project_id: 'project-1', title: 'Cedar' } }, fetchStatus: 'idle', isError: false }),
}));

beforeEach(() => {
  localStorage.clear();
  __setDensityForTest('full');
  mockItems = [];
  mockAskThePaper = true;
  mockOneVoice = true;
  mockQuery = { isPending: false, isFetching: false, isStale: false, error: null };
});

afterEach(() => __setDensityForTest(undefined));

it('closes More and returns Escape to its disclosure without relying on click focus', async () => {
  mockItems = [{ id: 'line-1', name: 'Chair', quantity: 1, item_type: 'fixed', status: 'specified' }];
  render(<><button>Unrelated focus</button><FFESection projectId="project-1" projectName="Cedar" mode="project" /><RecordAChangeSheet projectId="project-1" clientName="Client" /></>);
  const more = screen.getByRole('button', { name: /^More/ });
  fireEvent.click(more);
  screen.getByRole('button', { name: 'Unrelated focus' }).focus();
  fireEvent.click(screen.getByRole('button', { name: 'Record a selection change', exact: true }));
  expect(more).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('button', { name: 'Record a selection change', exact: true })).not.toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  await waitFor(() => expect(more).toHaveFocus());
});

it('prints the complete canonical total and pages, including a truly empty schedule', () => {
  const view = render(<LineQueryReading state={lineQueryState({ data: Array(2000), isPending: false, isFetching: false, isStale: false, error: null })} />);
  expect(screen.getByRole('status')).toHaveTextContent('Whole schedule · 2000 lines · 2 pages');
  view.rerender(<LineQueryReading state={lineQueryState({ data: [], isPending: false, isFetching: false, isStale: false, error: null })} />);
  expect(screen.getByRole('status')).toHaveTextContent('Whole schedule · 0 lines · 0 pages');
});

it('keeps initial loading and refusal unknown rather than printing an empty overview', () => {
  mockQuery.isPending = true;
  const view = render(<FFESection projectId="project-1" projectName="Cedar" mode="project" />);
  expect(document.querySelector('[data-line-query]')).toBeInTheDocument();
  expect(document.querySelector('[data-line-query]')).toHaveTextContent('Schedule total unknown. Reading the schedule');
  expect(document.querySelector('[data-pieces-overview]')).not.toBeInTheDocument();
  mockQuery = { isPending: false, isFetching: false, isStale: false, error: new Error('refused') };
  view.rerender(<FFESection projectId="project-1" projectName="Cedar" mode="project" />);
  expect(document.querySelector('[data-line-query]')).toHaveTextContent('Schedule total unknown. The schedule could not be read');
});

it('distinguishes refresh, stale and refused refresh without losing the last complete total', () => {
  mockItems = Array.from({length: 1001}, (_, i) => ({ id: 'line-' + i, name: 'Chair', quantity: 1, item_type: 'fixed', status: 'specified' }));
  mockQuery.isFetching = true;
  const view = render(<FFESection projectId="project-1" projectName="Cedar" mode="project" />);
  const reading = () => document.querySelector('[data-line-query]');
  expect(reading()).toHaveTextContent('1001 lines · 2 pages. Refreshing the schedule');
  mockQuery.isFetching = false; mockQuery.isStale = true;
  view.rerender(<FFESection projectId="project-1" projectName="Cedar" mode="project" />);
  expect(reading()).toHaveTextContent('Showing the last complete schedule; not yet refreshed');
  mockQuery.error = new Error('refused');
  view.rerender(<FFESection projectId="project-1" projectName="Cedar" mode="project" />);
  expect(reading()).toHaveAttribute('role', 'alert');
  expect(reading()).toHaveTextContent('1001 lines · 2 pages. The schedule could not be refreshed');
});

it('returns Escape to the clicked FF&E change trigger without prefocusing it', async () => {
  render(<><button>Unrelated focus</button><FFESection projectId="project-1" projectName="Cedar" mode="install" /><RecordAChangeSheet projectId="project-1" clientName="Client" /></>);
  screen.getByRole('button', {name: 'Unrelated focus'}).focus();
  const trigger = screen.getByRole('button', { name: 'Record a change' });
  fireEvent.click(trigger);
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole('dialog'), {key: 'Escape'});
  await waitFor(() => expect(trigger).toHaveFocus());
});


it.each(['loading', 'refused'])('keeps a persisted folded %s schedule unknown', (state) => {
  localStorage.setItem('patina:doc-fold:project-1:ffe', '1');
  mockQuery.isPending = state === 'loading';
  mockQuery.error = state === 'refused' ? new Error('refused') : null;
  render(<FFESection projectId="project-1" projectName="Cedar" mode="project" />);
  const summary = document.querySelector('[data-fold-summary]');
  expect(summary).toHaveTextContent('Schedule total unknown');
  expect(summary).not.toHaveTextContent('no lines yet');
});

it.each(['loading', 'refused'])('keeps the quiet %s schedule status unknown', (state) => {
  __setDensityForTest('quiet');
  mockQuery.isPending = state === 'loading';
  mockQuery.error = state === 'refused' ? new Error('refused') : null;
  render(<FFESection projectId="project-1" projectName="Cedar" mode="project" />);
  const status = document.querySelector('#ffe-region-body-project-1 .sr-only');
  expect(status).toHaveTextContent('Schedule total unknown');
  expect(status).not.toHaveTextContent('No recorded activity');
});

it('keeps known-empty folded copy unchanged', () => {
  localStorage.setItem('patina:doc-fold:project-1:ffe', '1');
  render(<FFESection projectId="project-1" projectName="Cedar" mode="project" />);
  expect(document.querySelector('[data-fold-summary]')).toHaveTextContent('no lines yet');
});

it('keeps standalone refusal Return and Escape alongside retry', () => {
  mockQuery.error = new Error('refused');
  const onReturn = jest.fn();
  render(<BuildRoom docId="project-1" lens="spec" room={null} canSeeMoney onReturn={onReturn} onNavigate={jest.fn()} onRedirect={jest.fn()} />);
  expect(screen.getByRole('link', { name: 'Back to Cedar' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(onReturn).toHaveBeenCalledTimes(1);
});

it('returns the live-PO sheet to the clicked line act with unrelated focus', async () => {
  mockItems = [{ id: 'line-1', name: 'Chair', quantity: 1, item_type: 'fixed', status: 'ordered', purchase_order: { id: 'po-1', status: 'sent', po_number: 'PO-1' } }];
  render(<><button>Unrelated focus</button><FFESection projectId="project-1" projectName="Cedar" mode="install" /><RecordAChangeSheet projectId="project-1" clientName="Client" /></>);
  const row = document.querySelector('#ffe-selection-line-1 > button')!;
  fireEvent.click(row);
  const trigger = document.querySelector<HTMLButtonElement>('[data-action-key="record-a-change-line"]')!;
  expect(trigger).not.toBeNull();
  screen.getByRole('button', { name: 'Unrelated focus' }).focus();
  fireEvent.click(trigger);
  expect(screen.getByTestId('po-change-sheet')).toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  await waitFor(() => expect(trigger).toHaveFocus());
});
