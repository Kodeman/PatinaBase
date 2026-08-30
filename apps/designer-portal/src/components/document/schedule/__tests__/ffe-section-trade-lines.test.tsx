import { fireEvent, render, screen } from '@testing-library/react';

let mockItems: Record<string, unknown>[] = [];
let mockRooms: Record<string, unknown>[] = [];
let mockInstruments: Record<string, unknown>[] = [];
let mockTradeScopes: Record<string, unknown>[] = [];
let mockAuthority: { data: unknown } = { data: null };
let mockTradeScopesPending = false;

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

jest.mock('@patina/supabase', () => ({
  useProjectFFEItems: () => ({ data: mockItems, isLoading: false, isError: false, refetch: jest.fn() }),
  useProjectFfeReadiness: () => ({ data: mockItems.map((item) => ({ selectionId: item.id, ready: true, missingFields: [] })) }),
  useProjectOwnedBoards: () => ({ data: [], isLoading: false }),
  useFfeInvoiceCoverage: () => ({ data: {} }),
}));

jest.mock('../add-to-project-sheet', () => ({
  AddToProjectSheet: () => null,
  openAddToProject: jest.fn(),
}));

jest.mock('@/hooks/use-document-rooms', () => ({
  useDocumentRooms: () => ({ data: mockRooms }),
  useAddDocumentRoom: () => ({ mutate: jest.fn() }),
}));

jest.mock('@/hooks/use-commercial-documents', () => ({
  commercialDocumentKeys: { budget: (id: string) => ['working-budget', id] },
  useProjectInstruments: () => ({ data: mockInstruments }),
  useTradeScopes: () => ({ data: mockTradeScopes, isPending: mockTradeScopesPending }),
  useProjectBillingAuthority: () => mockAuthority,
  useWorkingBudget: () => ({ isLoading: false, data: null }),
  useReleaseForAuthorization: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useSendFurnishingsAuthorization: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
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

jest.mock('../../accounts/invoice-overlays', () => ({
  openInvoiceComposer: jest.fn(),
}));
jest.mock('../../mobile/mobile-margin-chips', () => ({
  MobileMarginChips: () => null,
}));
jest.mock('../../work-block', () => ({ WorkBlock: () => null }));
jest.mock('../../folio-strip', () => ({ FolioStrip: () => null }));
jest.mock('../../strata-mark', () => ({ StrataMark: () => null }));
jest.mock('../../strata-mini-rule', () => ({ StrataMiniRule: () => null }));
jest.mock('../../line-unfold', () => ({ LineUnfold: () => null }));

// R127/W4 — this suite mounts a region on its own, with no page to attach the
// lens (OD-15 attaches `useLensDensity` in `page.tsx`), so nothing ever
// promotes and every stop would render its quiet form: a head, a count line
// and one leader, with the body these cases are about absent. The mock is the
// lens saying `full`, which is what a reader who has reached this region sees.
jest.mock('@/hooks/use-lens-density', () => ({
  useLensDensityStore: () => 'full',
  useLensDensity: () => ({
    forceFullThrough: () => {},
    settled: () => Promise.resolve(true),
    subscribe: () => () => {},
    getDensity: () => 'full',
    freeze: () => {},
  }),
}));

import { FFESection } from '../../ffe-section';

const renderSection = () =>
  render(<FFESection projectId="project-1" projectName="Ellsworth" mode="project" />);

/** A furnishing the studio still has to release. */
const furnishing = {
  id: 'line-1',
  name: 'Walnut bed, king',
  quantity: 1,
  status: 'specified',
  blocked: false,
  item_type: 'fixed',
  unit_price_cents: 1_230_000,
  line_total_cents: 1_230_000,
  project_room_id: 'room-1',
  room: { id: 'room-1', name: 'Primary bedroom' },
  received_quantity: null,
};

/** A trade scope's presence line — written by engage_trade_scope. */
const presenceLine = (over: Record<string, unknown> = {}) => ({
  id: 'trade-line-1',
  name: 'Drapery fabrication & install — Living',
  quantity: 1,
  status: 'approved',
  blocked: false,
  item_type: 'fixed',
  unit_price_cents: 490_000,
  line_total_cents: 490_000,
  project_room_id: 'room-2',
  room: { id: 'room-2', name: 'Living' },
  received_quantity: null,
  added_via: 'trade-scope',
  trade_scope_document_id: 'pcd-1',
  ...over,
});

describe('trade presence lines on the schedule', () => {
  beforeEach(() => {
    mockRooms = [
      { id: 'room-1', name: 'Primary bedroom', budget_cents: 0 },
      { id: 'room-2', name: 'Living', budget_cents: 0 },
    ];
    mockItems = [furnishing, presenceLine()];
    mockInstruments = [];
    mockTradeScopes = [
      { documentId: 'pcd-1', number: 1, progressState: 'in_progress' },
    ];
    mockAuthority = { data: { state: 'active', agreementId: 'agreement-1' } };
    mockTradeScopesPending = false;
  });

  it('stamps the scope progress on the left and its instrument on the right', () => {
    renderSection();
    expect(screen.getByText('In progress')).toBeInTheDocument();
    expect(screen.getByText('On trade scope · TS1')).toBeInTheDocument();
  });

  it('follows the scope forward as the work moves', () => {
    mockTradeScopes = [
      { documentId: 'pcd-1', number: 1, progressState: 'accepted' },
    ];
    renderSection();
    expect(screen.getByText('Accepted')).toBeInTheDocument();
  });

  it('refuses to let trade work join a furnishings release, and says which scope holds it', () => {
    renderSection();
    fireEvent.click(
      screen.getByRole('button', { name: /release for authorization/i }),
    );

    expect(
      screen.getByRole('checkbox', {
        name: 'Include Walnut bed, king in this release',
      }),
    ).toBeEnabled();
    expect(
      screen.getByRole('checkbox', {
        name: 'Include Drapery fabrication & install — Living in this release',
      }),
    ).toBeDisabled();
    expect(screen.getByText('on trade scope · № 1')).toBeInTheDocument();
  });

  it('drops the ordinal rather than inventing one for an unresolved scope', () => {
    mockTradeScopes = [];
    renderSection();
    fireEvent.click(
      screen.getByRole('button', { name: /release for authorization/i }),
    );
    expect(screen.getByText('on trade scope')).toBeInTheDocument();
    expect(screen.getByText('On trade scope')).toBeInTheDocument();
  });

  it('counts the trade line as committed work in its room', () => {
    renderSection();
    expect(screen.getByText(/1 of 1 underway/)).toBeInTheDocument();
  });

  // The bug this fences: while the trade query is still loading, the old
  // code fell back to a fixed "Engaged" stamp regardless of the scope's
  // actual state — wrong for a scope that is really substantially complete
  // or accepted. Loading must read quiet, never a guess.
  it('stays quiet while the trade scopes query has not resolved yet — no guessed stamp', () => {
    mockTradeScopesPending = true;
    renderSection();
    expect(screen.getByText('Drapery fabrication & install — Living')).toBeInTheDocument();
    expect(screen.queryByText('Engaged')).not.toBeInTheDocument();
    expect(screen.queryByText('In progress')).not.toBeInTheDocument();
    expect(screen.queryByText('Substantially complete')).not.toBeInTheDocument();
    expect(screen.queryByText('Accepted')).not.toBeInTheDocument();
  });

  // Install mode never fetches trade scopes at all (the query is disabled),
  // so a trade line there must stay quiet permanently rather than default to
  // "Engaged" for the life of the view.
  it('stays quiet for a trade line in install mode, where trade progress is never fetched', () => {
    mockTradeScopesPending = false; // even claiming "resolved"
    render(<FFESection projectId="project-1" projectName="Ellsworth" mode="install" />);
    expect(screen.getByText('Drapery fabrication & install — Living')).toBeInTheDocument();
    expect(screen.queryByText('Engaged')).not.toBeInTheDocument();
    expect(screen.queryByText('In progress')).not.toBeInTheDocument();
  });
});
