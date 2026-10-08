/**
 * US-19 FR3 F3-2 (P-2) — a need's Next act lands with focus on its line's own
 * control: `File the claim` on the damaged line's claim control, `Follow up
 * with the maker` on the unacknowledged PO line's control. The press is taken
 * (the event cancelled) only when a line carries the act; otherwise it keeps
 * its old landing.
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import { ACT_LANDING_EVENTS } from '@/lib/document/act-names';

let mockItems: Record<string, unknown>[] = [];
// Stands in for the unfold: the Order cell's PO control (order-cell.tsx) and,
// on a line with an open claim, the claim's act (claim-acts.tsx).
const mockLineUnfold = jest.fn((props: Record<string, unknown>) => {
  const item = props.item as { id: string; item_claims?: unknown[] } | undefined;
  return (
    <>
      <div role="group" aria-label="Order" data-testid="line-po-cell">
        <button type="button" data-po-control aria-label={`Open the order for ${item?.id}`}>
          PO
        </button>
      </div>
      {(item?.item_claims ?? []).length > 0 && (
        <button type="button" data-action-key="notify-vendor-of-ffe-claim">
          Notify the maker
        </button>
      )}
    </>
  );
});

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn(), regionFolded: jest.fn() },
}));
jest.mock('@/lib/help-system/open-help', () => ({ openHelp: jest.fn() }));
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));
jest.mock('@/components/document/buying/install-manifest', () => ({ InstallManifest: () => null }));
jest.mock('@patina/supabase', () => ({
  useStudioPurchases: () => ({ data: [] }),
  useProjectPoCostLines: () => ({ data: [] }),
  useUnresolvedProcurementExceptions: () => ({ data: [] }),
  useProjectFFEItems: () => ({ data: mockItems, isLoading: false, isError: false, refetch: jest.fn() }),
  useProjectFfeReadiness: () => ({
    data: mockItems.map((item) => ({ selectionId: item.id, ready: true, missingFields: [] })),
  }),
  useProjectOwnedBoards: () => ({ data: [], isLoading: false }),
  useFfeInvoiceCoverage: () => ({ data: {} }),
  useUser: () => ({ user: { id: 'designer-1' } }),
}));
jest.mock('../schedule/add-to-project-sheet', () => ({
  AddToProjectSheet: () => null,
  openAddToProject: jest.fn(),
}));
jest.mock('@/hooks/use-document-rooms', () => ({
  useDocumentRooms: () => ({ data: [] }),
  useAddDocumentRoom: () => ({ mutate: jest.fn() }),
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
jest.mock('../accounts/invoice-overlays', () => ({ openInvoiceComposer: jest.fn() }));
jest.mock('../work-block', () => ({ WorkBlock: () => null }));
jest.mock('../folio-strip', () => ({ FolioStrip: () => null }));
jest.mock('../strata-mark', () => ({ StrataMark: () => null }));
jest.mock('../strata-mini-rule', () => ({ StrataMiniRule: () => null }));
jest.mock('../line-unfold', () => ({
  LineUnfold: (props: Record<string, unknown>) => mockLineUnfold(props),
}));
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

import { FFESection, ffeActLine } from '../ffe-section';
import { __setDensityForTest } from '@/hooks/use-lens-density';

const line = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  name: `Piece ${id}`,
  quantity: 1,
  status: 'ordered',
  blocked: false,
  item_type: 'fixed',
  unit_price_cents: 100_000,
  line_total_cents: 100_000,
  project_room_id: 'room-1',
  room: { id: 'room-1', name: 'Living Room' },
  received_quantity: 0,
  ...over,
});

const answered = line('line-answered', {
  purchase_order: { id: 'po-1', po_number: 'WS-101', status: 'sent', sent_at: '2026-09-01', acknowledged_at: '2026-09-02' },
});
const newer = line('line-newer', {
  purchase_order: { id: 'po-2', po_number: 'WS-102', status: 'sent', sent_at: '2026-09-20', acknowledged_at: null },
});
const older = line('line-older', {
  purchase_order: { id: 'po-3', po_number: 'WS-103', status: 'sent', sent_at: '2026-09-10', acknowledged_at: null },
});
const damaged = line('line-damaged', {
  status: 'delivered',
  received_quantity: 1,
  item_claims: [{ id: 'claim-1', state: 'drafted' }],
});

/** What page.tsx's band press does under one-voice; true when taken. */
const press = (detail: 'claim' | 'follow-up') =>
  !window.dispatchEvent(new CustomEvent(ACT_LANDING_EVENTS.ffeAct, { detail, cancelable: true }));

beforeEach(() => {
  __setDensityForTest('full');
  mockLineUnfold.mockClear();
  window.localStorage.clear();
});
afterEach(() => {
  __setDensityForTest(undefined);
});

describe('ffeActLine', () => {
  it('picks the damaged line with an open claim, and the oldest unanswered PO', () => {
    expect(ffeActLine([answered, newer, older, damaged], 'claim')?.id).toBe('line-damaged');
    expect(ffeActLine([answered, newer, older, damaged], 'follow-up')?.id).toBe('line-older');
  });

  it('skips a removed line, a settled claim, and a delivered or cancelled PO', () => {
    expect(
      ffeActLine(
        [
          { ...damaged, removed_at: '2026-10-01' },
          line('line-settled', { item_claims: [{ state: 'resolved' }] }),
        ],
        'claim',
      ),
    ).toBeNull();
    expect(
      ffeActLine(
        [
          line('d', { purchase_order: { sent_at: '2026-09-01', acknowledged_at: null, status: 'delivered' } }),
          line('c', { purchase_order: { sent_at: '2026-09-01', acknowledged_at: null, status: 'cancelled' } }),
          line('u', { purchase_order: { sent_at: null, acknowledged_at: null, status: 'draft' } }),
        ],
        'follow-up',
      ),
    ).toBeNull();
  });
});

describe('a need’s act lands on its line’s control (F3-2)', () => {
  it('File the claim: unfolds the damaged line and focuses its claim control', async () => {
    // Pieces closed by the designer on an earlier visit: the landing unfolds it.
    window.localStorage.setItem('patina:doc-fold:project-1:ffe', '1');
    mockItems = [answered, damaged];
    render(<FFESection projectId="project-1" projectName="Chen" mode="project" />);

    let taken = false;
    act(() => {
      taken = press('claim');
    });
    expect(taken).toBe(true);
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Notify the maker' })),
    );
    expect(document.getElementById('ffe-selection-line-damaged')).toContainElement(
      document.activeElement as HTMLElement,
    );
  });

  it('Follow up with the maker: focuses the oldest unacknowledged PO line’s control', async () => {
    mockItems = [answered, newer, older];
    render(<FFESection projectId="project-1" projectName="Chen" mode="project" />);

    let taken = false;
    act(() => {
      taken = press('follow-up');
    });
    expect(taken).toBe(true);
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Open the order for line-older' }),
      ),
    );
  });

  it('leaves the press untaken when no line carries the act', () => {
    mockItems = [answered];
    render(<FFESection projectId="project-1" projectName="Chen" mode="project" />);
    let claimTaken = true;
    let followTaken = true;
    act(() => {
      claimTaken = press('claim');
      followTaken = press('follow-up');
    });
    expect(claimTaken).toBe(false);
    expect(followTaken).toBe(false);
  });
});
