/**
 * C-24 in the unfold's buy cell: the frame-and-fabric pair (link or add the
 * fabric line; both lines show the pair), the COM facts with the yardage
 * helper, and the line's submittals.
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { FfePairLine } from '@patina/supabase';

const mockCreate = jest.fn();
const mockLink = jest.fn();
const mockUpdateCom = jest.fn();
const mockRecord = jest.fn();
const mockDecide = jest.fn();
const mockLines: { data: FfePairLine[] | undefined } = { data: [] };
const mockComRow: { data: unknown } = { data: null };
const mockSubmittals: { data: Record<string, unknown>[] } = { data: [] };

jest.mock('@patina/supabase', () => ({
  useFfePairLines: () => ({ data: mockLines.data }),
  useLinkFfePair: () => ({ mutateAsync: mockLink, isPending: false }),
  useCreateNamedProjectNeed: () => ({ mutateAsync: mockCreate, isPending: false }),
  useFfeComSpec: () => ({ data: mockComRow.data, isLoading: false }),
  useUpdateFfeComSpec: () => ({ mutateAsync: mockUpdateCom, isPending: false }),
  useProjectSubmittals: () => ({ data: mockSubmittals.data }),
  useRecordSubmittal: () => ({ mutateAsync: mockRecord, isPending: false }),
  useDecideSubmittal: () => ({ mutateAsync: mockDecide, isPending: false }),
}));
jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

import { ComPiece, readPair } from '../com-piece';

const line = (over: Partial<FfePairLine>): FfePairLine => ({
  id: 'x',
  name: 'x',
  project_room_id: 'room-1',
  assignment_scope: 'room',
  vendor_id: null,
  vendor_name: null,
  purchase_order_id: null,
  parent_ffe_item_id: null,
  link_kind: null,
  purchase_order: null,
  ...over,
});

const SOFA = line({ id: 'line-sofa', name: 'Sofa', vendor_name: 'Hale' });
const FABRIC = line({
  id: 'line-fabric',
  name: 'Sofa — COM fabric',
  vendor_name: 'Kessler',
  parent_ffe_item_id: 'line-sofa',
  link_kind: 'com',
});
const INSTALL = line({
  id: 'line-install',
  name: 'Install, upholstery',
  vendor_name: 'Hang Right',
  parent_ffe_item_id: 'line-sofa',
  link_kind: 'labor',
});
const RUG = line({ id: 'line-rug', name: 'Brae linen, 19 yd' });

const SOFA_ITEM = {
  id: 'line-sofa',
  name: 'Sofa',
  vendor_name: 'Hale',
  project_room_id: 'room-1',
  assignment_scope: 'room',
  parent_ffe_item_id: null,
};

const renderPiece = (item: Record<string, unknown> = SOFA_ITEM, canEdit = true) =>
  render(<ComPiece item={item} projectId="project-1" canEdit={canEdit} />);

beforeEach(() => {
  jest.clearAllMocks();
  mockLines.data = [SOFA, RUG];
  mockComRow.data = null;
  mockSubmittals.data = [];
  mockCreate.mockResolvedValue({ outcome: 'created', selectionId: 'line-new' });
  mockLink.mockResolvedValue({ id: 'line-new', project_id: 'project-1' });
  mockUpdateCom.mockResolvedValue({});
  mockRecord.mockResolvedValue({ project_id: 'project-1' });
  mockDecide.mockResolvedValue({ project_id: 'project-1' });
});

describe('readPair', () => {
  it('finds the piece a fabric supplies, the fabric a piece takes, and the linkable lines', () => {
    const lines = [SOFA, FABRIC, RUG];
    expect(readPair({ id: 'line-fabric' }, lines).parent?.id).toBe('line-sofa');
    expect(readPair({ id: 'line-sofa' }, lines).children.map((l) => l.id)).toEqual(['line-fabric']);
    // Neither a fabric already linked nor a piece that takes COM is linkable.
    expect(readPair({ id: 'line-rug' }, lines).candidates).toEqual([]);
    expect(readPair({ id: 'line-sofa' }, [SOFA, RUG]).candidates.map((l) => l.id)).toEqual(['line-rug']);
  });

  it('never reads a labor child as COM, on either side of the link', () => {
    const lines = [SOFA, INSTALL, RUG];
    const install = readPair({ id: 'line-install' }, lines);
    expect(install.parent).toBeNull();
    expect(install.onPiece).toBe(true);
    const sofa = readPair({ id: 'line-sofa' }, lines);
    expect(sofa.children).toEqual([]);
    expect(sofa.onPiece).toBe(false);
    // One level of any kind: the install is not linkable, the rug still is.
    expect(sofa.candidates.map((l) => l.id)).toEqual(['line-rug']);
  });
});

describe('pair linking', () => {
  it('adds the fabric as a new line in the piece’s room and links it to the piece', async () => {
    renderPiece();
    fireEvent.click(screen.getByRole('button', { name: 'This piece takes COM' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add the fabric line' }));

    await waitFor(() => expect(mockLink).toHaveBeenCalled());
    expect(mockCreate).toHaveBeenCalledWith({
      projectId: 'project-1',
      name: 'Sofa — COM fabric',
      quantity: 1,
      itemType: 'tbd',
      assignmentScope: 'room',
      roomId: 'room-1',
      disposition: 'candidate',
      source: 'named-need',
      idempotencyKey: expect.any(String),
    });
    expect(mockLink).toHaveBeenCalledWith({ childId: 'line-new', parentId: 'line-sofa' });
  });

  it('links an existing line as the piece’s fabric', async () => {
    renderPiece();
    fireEvent.click(screen.getByRole('button', { name: 'This piece takes COM' }));
    fireEvent.change(screen.getByLabelText('Link a fabric line'), { target: { value: 'line-rug' } });
    fireEvent.click(screen.getByRole('button', { name: 'Link' }));
    await waitFor(() =>
      expect(mockLink).toHaveBeenCalledWith({ childId: 'line-rug', parentId: 'line-sofa' }),
    );
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('shows the pair on both lines, and unlinks from either', async () => {
    mockLines.data = [SOFA, FABRIC];
    mockComRow.data = { id: 'spec-sofa', row_version: 3, com_spec: null };
    const { unmount } = renderPiece();
    expect(screen.getByText(/Takes COM ·/)).toHaveTextContent('Takes COM · Sofa — COM fabric from Kessler');
    expect(screen.queryByRole('button', { name: 'This piece takes COM' })).not.toBeInTheDocument();
    unmount();

    renderPiece({ id: 'line-fabric', name: 'Sofa — COM fabric', parent_ffe_item_id: 'line-sofa' });
    expect(screen.getByText(/COM fabric for/)).toHaveTextContent('COM fabric for Sofa, shipped to Hale');
    fireEvent.click(screen.getByRole('button', { name: 'Unlink' }));
    await waitFor(() =>
      expect(mockLink).toHaveBeenCalledWith({ childId: 'line-fabric', parentId: null }),
    );
  });

  it('offers no pair act to a reader who cannot edit', () => {
    renderPiece(SOFA_ITEM, false);
    expect(screen.queryByRole('button', { name: 'This piece takes COM' })).not.toBeInTheDocument();
  });
});

describe('the COM facts', () => {
  beforeEach(() => {
    mockLines.data = [SOFA, FABRIC];
    mockComRow.data = {
      id: 'spec-sofa',
      row_version: 3,
      com_spec: { fabricName: 'Brae linen', mill: 'Kessler' },
    };
  });

  it('shows the helper’s arithmetic and saves com_details’ keys with the order figure', async () => {
    renderPiece();
    const form = screen.getByTestId('com-spec');
    expect(within(form).getByLabelText('Fabric')).toHaveValue('Brae linen');
    fireEvent.change(within(form).getByLabelText('Chart yd'), { target: { value: '14' } });
    fireEvent.change(within(form).getByLabelText('Repeat in'), { target: { value: '27' } });
    fireEvent.change(within(form).getByLabelText('Sidemark'), { target: { value: 'HART-LR-SOFA' } });

    const working = screen.getByTestId('com-yardage');
    expect(working).toHaveTextContent('Repeat 27" (+30%)');
    expect(working).toHaveTextContent('+ 4.2 yd');
    expect(working).toHaveTextContent('20 yd');

    fireEvent.click(screen.getByRole('button', { name: 'Save the COM' }));
    await waitFor(() => expect(mockUpdateCom).toHaveBeenCalled());
    expect(mockUpdateCom).toHaveBeenCalledWith({
      projectId: 'project-1',
      specId: 'spec-sofa',
      expectedRowVersion: 3,
      comSpec: {
        fabricName: 'Brae linen',
        mill: 'Kessler',
        yardage: '20',
        railroaded: false,
        sidemark: 'HART-LR-SOFA',
        yardageHelper: { chartYards: 14, widthIn: null, repeatIn: 27, workroomYards: null },
      },
    });
  });

  it("orders the workroom's figure plus cutting once it is typed", () => {
    renderPiece();
    fireEvent.change(screen.getByLabelText('Chart yd'), { target: { value: '14' } });
    fireEvent.change(screen.getByLabelText("Workroom's yards"), { target: { value: '17' } });
    expect(screen.getByTestId('com-yardage')).toHaveTextContent(
      "Hale asked for 17 yd. With 10% for cutting that is 18.7 yd, ordered as 19 yd. Hale's number wins.",
    );
  });
});

describe('submittals', () => {
  it('asks for a CFA first on a fabric line', async () => {
    mockLines.data = [SOFA, FABRIC];
    renderPiece({ id: 'line-fabric', name: 'Sofa — COM fabric', parent_ffe_item_id: 'line-sofa' });
    fireEvent.click(screen.getByRole('button', { name: 'Record a submittal' }));
    expect(screen.getByLabelText('Submittal kind')).toHaveValue('cfa');
    fireEvent.change(screen.getByLabelText('Requested on'), { target: { value: '2026-10-02' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record it' }));
    await waitFor(() =>
      expect(mockRecord).toHaveBeenCalledWith({
        ffeItemId: 'line-fabric',
        kind: 'cfa',
        requestedOn: '2026-10-02',
      }),
    );
  });

  it('reads a pending CFA, records its dye lot and reserve, and decides it once', async () => {
    mockSubmittals.data = [
      {
        source: 'submittal',
        id: 'sub-1',
        ffe_item_id: 'line-sofa',
        kind: 'cfa',
        requested_on: '2026-10-02',
        received_on: null,
        dye_lot: null,
        reserve_expires_on: '2026-10-09',
        decision: 'pending',
        decided_at: null,
      },
      // Another line's submittal never reads here.
      { source: 'submittal', id: 'sub-2', ffe_item_id: 'line-rug', kind: 'strike_off', decision: 'pending' },
    ];
    renderPiece();
    const rows = screen.getAllByTestId('line-submittal');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent('CFA · requested 2 October · reserve to 9 October · not yet decided');

    fireEvent.change(screen.getByLabelText('Dye lot'), { target: { value: '31-118' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(mockRecord).toHaveBeenCalledWith({
        id: 'sub-1',
        receivedOn: null,
        dyeLot: '31-118',
        reserveExpiresOn: '2026-10-09',
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() =>
      expect(mockDecide).toHaveBeenCalledWith({ submittalId: 'sub-1', decision: 'approved' }),
    );
  });

  it('reads a configured piece’s submittal milestone without offering to decide it here', () => {
    mockSubmittals.data = [
      {
        source: 'configuration_milestone',
        id: 'm-1',
        ffe_item_id: 'line-sofa',
        kind: 'custom_submittal',
        decision: 'pending',
      },
    ];
    renderPiece();
    expect(screen.getByTestId('line-submittal')).toHaveTextContent(
      'Submittal · pending on the configuration',
    );
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
  });
});
