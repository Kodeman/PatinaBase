/**
 * US-21 fix-now #8 — the landing half of the spec book's way back. The back
 * link emits `/doc/<id>#line-<ffeItemId>`; the Pieces region, once its
 * schedule has settled, resolves that hash to the existing row
 * `ffe-selection-<id>`, unfolds Pieces and the line, and scrolls the row into
 * view. The hash is read, never cleared (the arrival gate reads it too), and
 * no second `line-<id>` element id is added.
 */
import { act, render } from '@testing-library/react';

let mockItems: Record<string, unknown>[] = [];
let mockItemsLoading = false;

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: {
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
    regionFolded: jest.fn(),
  },
}));

jest.mock('@/lib/help-system/open-help', () => ({ openHelp: jest.fn() }));

// US-21 CONTRACT §3.8 rule 4 — the region renders in its shipped state.
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (flag: string) => ({
    value: flag === 'one-voice' || flag === 'ask-the-paper',
    isLoading: false,
  }),
}));

jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock('@/components/document/buying/install-manifest', () => ({ InstallManifest: () => null }));

jest.mock('@patina/supabase', () => ({
  useProjectRoomPlacements: () => ({ data: [] }),
  useProjectPalettes: () => ({ data: [] }),
  useProcurementDrafts: () => ({ data: [] }),
  useInstallWindow: () => ({ data: null, isSuccess: true }),
  useStudioPurchases: () => ({ data: [] }),
  useProjectPoCostLines: () => ({ data: [] }),
  useUnresolvedProcurementExceptions: () => ({ data: [] }),
  useProjectFFEItems: () => ({
    data: mockItemsLoading ? undefined : mockItems,
    isLoading: mockItemsLoading,
    isError: false,
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

jest.mock('../schedule/add-to-project-sheet', () => ({
  AddToProjectSheet: () => null,
  openAddToProject: jest.fn(),
}));

jest.mock('@/hooks/use-document-rooms', () => ({
  useDocumentRooms: () => ({ data: [{ id: 'room-1', name: 'Primary bedroom', budget_cents: 0 }] }),
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
      get: (_target, key: string) => ({ key, label: key, color: 'var(--text-muted)' }),
    },
  ),
}));

jest.mock('../accounts/invoice-overlays', () => ({ openInvoiceComposer: jest.fn() }));
jest.mock('../work-block', () => ({ WorkBlock: () => null }));
jest.mock('../folio-strip', () => ({ FolioStrip: () => null }));
jest.mock('../strata-mark', () => ({ StrataMark: () => null }));
jest.mock('../strata-mini-rule', () => ({ StrataMiniRule: () => null }));
// The unfolded line prints a marker, so the test can see which line unfolded.
jest.mock('../line-unfold', () => ({
  LineUnfold: ({ item }: { item: { id: string } }) =>
    require('react').createElement('div', { 'data-testid': `unfold-${item.id}` }),
}));

jest.mock('@/hooks/use-section-work', () => {
  const actual = jest.requireActual('@/hooks/use-section-work');
  const idle = { mutate: jest.fn(), mutateAsync: jest.fn(), isPending: false };
  const empty = () => ({ data: [], isLoading: false, isError: false, refetch: jest.fn() });
  return {
    ...actual,
    useSectionTasks: empty,
    useSectionGates: empty,
    useSectionLoggedMinutes: () => ({ data: 0 }),
    useCreateSectionTask: () => idle,
    useToggleSectionTask: () => idle,
    useRequestSectionGate: () => idle,
  };
});

import { FFESection } from '../ffe-section';
import { __setDensityForTest } from '@/hooks/use-lens-density';

const line = (id: string, name: string) => ({
  id,
  name,
  quantity: 1,
  status: 'specified',
  blocked: false,
  item_type: 'fixed',
  product_id: `product-${id}`,
  unit_price_cents: 120_000,
  line_total_cents: 120_000,
  project_room_id: 'room-1',
  room: { id: 'room-1', name: 'Primary bedroom' },
  received_quantity: null,
});

const section = () => (
  <FFESection projectId="project-1" projectName="Ellsworth" mode="project" />
);
/** Mount, then let the paint frames run. */
const renderProject = () => {
  const view = render(section());
  paint();
  return view;
};
const rerenderProject = (view: ReturnType<typeof render>) => {
  view.rerender(section());
  paint();
};

const rowToggle = (id: string) =>
  document.querySelector<HTMLElement>(`#ffe-selection-${id} > button[aria-expanded]`);

let scrolled: Element[] = [];

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, '', '/doc/project-1');
  mockItems = [line('ffe-1', 'Walnut bed, king'), line('ffe-2', 'Linen drapery')];
  mockItemsLoading = false;
  scrolled = [];
  __setDensityForTest('full');
  Element.prototype.scrollIntoView = jest.fn(function (this: Element) {
    scrolled.push(this);
  });
  // The landing waits for frames; each frame runs after React has committed.
  frames = [];
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    frames.push(cb);
    return frames.length;
  });
});

let frames: FrameRequestCallback[] = [];
/** Paint frames until none are queued (bounded: the landing gives up at 60). */
const paint = () => {
  for (let i = 0; i < 100 && frames.length > 0; i += 1) {
    const due = frames;
    frames = [];
    act(() => due.forEach((cb) => cb(0)));
  }
};

afterEach(() => {
  __setDensityForTest(undefined);
  jest.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('Pieces — #line-<id> landing (US-21 fix-now #8)', () => {
  it('resolves #line-<id> to the ffe-selection row, unfolds it and scrolls it into view', () => {
    window.history.replaceState(null, '', '/doc/project-1#line-ffe-2');
    renderProject();

    const row = document.getElementById('ffe-selection-ffe-2');
    expect(row).not.toBeNull();
    expect(rowToggle('ffe-2')).toHaveAttribute('aria-expanded', 'true');
    expect(document.querySelector('[data-testid="unfold-ffe-2"]')).not.toBeNull();
    // Only the named line unfolds.
    expect(rowToggle('ffe-1')).toHaveAttribute('aria-expanded', 'false');
    expect(scrolled).toEqual([row]);
    // One id on the row: the hash maps onto it, no second `line-<id>` id.
    expect(document.getElementById('line-ffe-2')).toBeNull();
    // Read, never cleared: the arrival gate reads the same hash.
    expect(window.location.hash).toBe('#line-ffe-2');
  });

  it('waits for the schedule to settle, then lands', () => {
    window.history.replaceState(null, '', '/doc/project-1#line-ffe-1');
    mockItemsLoading = true;
    const view = renderProject();
    expect(scrolled).toHaveLength(0);
    expect(rowToggle('ffe-1')).toBeNull();

    mockItemsLoading = false;
    rerenderProject(view);

    expect(rowToggle('ffe-1')).toHaveAttribute('aria-expanded', 'true');
    expect(scrolled).toEqual([document.getElementById('ffe-selection-ffe-1')]);
  });

  it('opens a Pieces region she had folded, and a quiet one, to reach the line', () => {
    window.localStorage.setItem('patina:doc-fold:project-1:ffe', '1');
    __setDensityForTest('quiet');
    window.history.replaceState(null, '', '/doc/project-1#line-ffe-2');
    renderProject();

    expect(document.querySelector('[data-fold-seam]')).toBeNull();
    expect(rowToggle('ffe-2')).toHaveAttribute('aria-expanded', 'true');
    expect(scrolled).toEqual([document.getElementById('ffe-selection-ffe-2')]);
  });

  it('honours the hash once: a refetch does not re-open a line she folded', () => {
    window.history.replaceState(null, '', '/doc/project-1#line-ffe-2');
    const view = renderProject();
    act(() => {
      rowToggle('ffe-2')!.click();
    });
    expect(rowToggle('ffe-2')).toHaveAttribute('aria-expanded', 'false');

    mockItems = [...mockItems];
    rerenderProject(view);

    expect(rowToggle('ffe-2')).toHaveAttribute('aria-expanded', 'false');
    expect(scrolled).toHaveLength(1);
  });

  it('US-21 a10 — back from the Build room, #pieces-room-<id> bars that row and brings it to the top', () => {
    window.localStorage.setItem('patina:doc-fold:project-1:ffe', '1');
    window.history.replaceState(null, '', '/doc/project-1#pieces-room-room-1');
    renderProject();

    const row = document.getElementById('pieces-room-room-1');
    expect(row).not.toBeNull();
    expect(row).toHaveAttribute('data-returned', 'true');
    expect(row).toHaveClass('border-l-[color:var(--ink)]');
    expect(scrolled).toEqual([row]);
    expect(window.location.hash).toBe('#pieces-room-room-1');
  });

  it('does nothing for a line that is not on the paper, or for any other hash', () => {
    window.history.replaceState(null, '', '/doc/project-1#line-gone');
    // US-21 Q14 — nothing unfolds: the rooms stay folded, so no line prints.
    const first = renderProject();
    expect(scrolled).toHaveLength(0);
    expect(rowToggle('ffe-1')).toBeNull();
    expect(rowToggle('ffe-2')).toBeNull();
    first.unmount();

    window.history.replaceState(null, '', '/doc/project-1#ffe-selection-ffe-1');
    renderProject();
    expect(scrolled).toHaveLength(0);
    expect(rowToggle('ffe-1')).toBeNull();
  });
});
