import { render, screen } from '@testing-library/react';
import RoomViewPage from './page';

let mockRoomGeometryData: {
  header: unknown;
  elements: unknown[];
  document: { engagementId: string | null; activeSection: string | null };
} | undefined;
let mockRoomGeometryLoading = false;
let mockDocEngagementResult: {
  data:
    | { kind: 'engagement'; row: { engagement_id: string; active_section: string } }
    | { kind: 'redirect'; projectId: string }
    | { kind: 'missing' }
    | undefined;
  isLoading: boolean;
  isFetching: boolean;
};

jest.mock('@patina/supabase', () => ({
  useRoomGeometry: () => ({ data: mockRoomGeometryData, isLoading: mockRoomGeometryLoading }),
  useRoomScanPhotos: () => ({ data: [] }),
}));

jest.mock('@/hooks/use-document-state', () => ({
  useDocumentEngagement: (id: string) =>
    id ? mockDocEngagementResult : { data: undefined, isLoading: false, isFetching: false },
}));

jest.mock('@/lib/room-view/from-rows', () => ({
  roomGeometryFromRows: () => ({ geometry: null, thicknessConvention: false, provenance: null }),
}));

const roomOpened = jest.fn();
jest.mock('@/lib/analytics', () => ({
  roomEvents: { roomOpened: (...args: unknown[]) => roomOpened(...args) },
}));

jest.mock('@/components/document/rooms/room-view/room-view', () => ({
  RoomView: () => null,
}));

jest.mock('@/components/document/rooms/room-shell', () => ({
  RoomShell: ({
    backTo,
    backLabel,
    children,
  }: {
    backTo?: string;
    backLabel?: string;
    children: React.ReactNode;
  }) => (
    <div>
      <span data-testid="back-to">{backTo ?? 'none'}</span>
      <span data-testid="back-label">{backLabel ?? 'none'}</span>
      {children}
    </div>
  ),
}));

const fulfilledParams = {
  status: 'fulfilled',
  value: { id: 'scan-1' },
  then: () => undefined,
} as unknown as Promise<{ id: string }>;

function setSearch(search: string) {
  window.history.pushState({}, '', `/room/scan-1${search}`);
}

describe('RoomViewPage — A2 scoped-back referrer resolution', () => {
  beforeEach(() => {
    roomOpened.mockReset();
    mockRoomGeometryData = {
      header: {},
      elements: [],
      document: { engagementId: 'canonical-doc', activeSection: 'brief' },
    };
    mockRoomGeometryLoading = false;
    mockDocEngagementResult = { data: undefined, isLoading: false, isFetching: false };
    setSearch('');
  });

  it('Case A: targets the docId referrer document (its own phase, not the canonical row\'s) when its resolved id matches this room\'s own canonical document', () => {
    setSearch('?from=document&docId=stale-alias-of-canonical');
    mockDocEngagementResult = {
      data: { kind: 'engagement', row: { engagement_id: 'canonical-doc', active_section: 'direction' } },
      isLoading: false,
      isFetching: false,
    };

    render(<RoomViewPage params={fulfilledParams} />);

    expect(screen.getByTestId('back-to').textContent).toBe('/doc/canonical-doc');
    expect(screen.getByTestId('back-label').textContent).toBe('the Document · Direction');
  });

  it('NAV-3: a docId referrer resolving to a DIFFERENT document (not this room\'s own) is not trusted — falls back to the canonical document', () => {
    setSearch('?from=document&docId=unrelated-but-accessible-doc');
    mockDocEngagementResult = {
      data: { kind: 'engagement', row: { engagement_id: 'other-designers-doc', active_section: 'proposal' } },
      isLoading: false,
      isFetching: false,
    };

    render(<RoomViewPage params={fulfilledParams} />);

    expect(screen.getByTestId('back-to').textContent).toBe('/doc/canonical-doc');
    expect(screen.getByTestId('back-label').textContent).toBe('the Document · Brief');
  });

  it('Case B: falls back to the scan canonical document when no docId arrived', () => {
    setSearch('?from=document');

    render(<RoomViewPage params={fulfilledParams} />);

    expect(screen.getByTestId('back-to').textContent).toBe('/doc/canonical-doc');
    expect(screen.getByTestId('back-label').textContent).toBe('the Document · Brief');
  });

  it('Case C: follows a redirect resolution (J6-style stale docId) to the redirect target, phase-qualified from this room\'s own canonical document', () => {
    // The room's own canonical document has already migrated (via
    // room_scan_documents' own document_state join) to the same identity
    // the stale docId's redirect leg resolves to — the realistic J6 shape.
    mockRoomGeometryData!.document = { engagementId: 'chain-root-proposal', activeSection: 'direction' };
    setSearch('?from=document&docId=stale-relationship-id');
    mockDocEngagementResult = {
      data: { kind: 'redirect', projectId: 'chain-root-proposal' },
      isLoading: false,
      isFetching: false,
    };

    render(<RoomViewPage params={fulfilledParams} />);

    expect(screen.getByTestId('back-to').textContent).toBe('/doc/chain-root-proposal');
    expect(screen.getByTestId('back-label').textContent).toBe('the Document · Direction');
  });

  it('NAV-3: a redirect resolution to a DIFFERENT document (not this room\'s own) is not trusted — falls back to the canonical document', () => {
    setSearch('?from=document&docId=stale-relationship-id');
    mockDocEngagementResult = {
      data: { kind: 'redirect', projectId: 'some-other-project' },
      isLoading: false,
      isFetching: false,
    };

    render(<RoomViewPage params={fulfilledParams} />);

    expect(screen.getByTestId('back-to').textContent).toBe('/doc/canonical-doc');
    expect(screen.getByTestId('back-label').textContent).toBe('the Document · Brief');
  });

  it('holds the leave affordance back (no flash of the canonical fallback) while the docId referrer is still loading', () => {
    setSearch('?from=document&docId=referring-doc');
    mockDocEngagementResult = { data: undefined, isLoading: true, isFetching: true };

    render(<RoomViewPage params={fulfilledParams} />);

    expect(screen.getByTestId('back-to').textContent).toBe('none');
  });

  it('falls back to the canonical document when the docId referrer resolves missing', () => {
    setSearch('?from=document&docId=orphaned-id');
    mockDocEngagementResult = { data: { kind: 'missing' }, isLoading: false, isFetching: false };

    render(<RoomViewPage params={fulfilledParams} />);

    expect(screen.getByTestId('back-to').textContent).toBe('/doc/canonical-doc');
  });

  it('shows no leave affordance at all when the door did not arrive from a document', () => {
    setSearch('');

    render(<RoomViewPage params={fulfilledParams} />);

    expect(screen.getByTestId('back-to').textContent).toBe('none');
  });
});
