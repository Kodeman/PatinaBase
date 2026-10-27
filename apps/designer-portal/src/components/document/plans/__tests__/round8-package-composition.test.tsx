import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import type { PlanRoomBundle } from '@patina/supabase';
import { PlanRoomSet, PlanIssueHistory, PlanPrintProvenance, PlanSheetComposition } from '../plan-room-set';
import { PlanSheetDetail } from '../plan-sheet-detail';
import { DesignChapter } from '../../paper/chapters/design-chapter';

jest.mock('@patina/supabase', () => ({
  useProfile: () => ({ data: { id: 'signed-in-filer', display_name: '  Sam Studio  ', full_name: 'Samuel Studio' } }),
  useProjectRoster: () => ({ data: [
    { profile_id: 'original-filer', display_name: '  Morgan Maker  ' },
    { profile_id: 'new-lead', display_name: 'Leah Designer' },
  ] }),
  usePlanRoom: () => ({ data: mockBundle, isPending: false, isError: false }),
  useProjectRooms: () => ({ data: mockRooms, isPending: false, isError: false }),
  useProjectRoomScans: () => ({ data: [], isPending: false, isError: false }),
  useGeneratedRoomFilesByScan: () => ({ data: new Map(), isPending: false, isError: false }),
  useRoomScanCovers: () => ({ data: new Map(), isPending: false, isError: false }),
  useRoomConceptRenderRecord: () => ({ data: null, isPending: false, isError: false }),
  useSetPlanSheetState: () => ({ mutateAsync: jest.fn() }),
  useReissuePlanTransmittalLink: () => ({ mutateAsync: jest.fn() }),
  useRevokePlanTransmittalLink: () => ({ mutateAsync: jest.fn() }),
  createBrowserClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { storage_path: 'private/print.pdf' } }) }) }) }),
    storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'https://example.test/private-print' } }) }) },
  }),
}));
jest.mock('@/components/feedback/inline-error-surface', () => ({ InlineErrorSurface: () => null }));
jest.mock('@/components/room-file/capture-context-section', () => ({ CaptureContextSection: () => null }));
jest.mock('@/lib/analytics/document-events', () => ({ documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() } }));
jest.mock('@/lib/analytics/plan-room-events', () => ({ planRoomEvents: { printViewed: jest.fn() } }));

const mockRooms = [
  { id: 'room-a', name: 'Kitchen' },
  { id: 'room-b', name: 'Kitchen' },
];
const fixture = (): PlanRoomBundle => ({
  sheets: [
    { id: 'sheet-a', sheet_number: 'K-201', title: 'New live title', current_print_id: 'print-b', state: 'draft', created_by: 'new-lead' },
    { id: 'sheet-b', sheet_number: 'K-202', title: 'Kitchen', current_print_id: null, state: 'draft' },
  ],
  prints: [
    { id: 'print-a', sheet_id: 'sheet-a', print_number: 1, rev_letter: 'A', project_document_id: 'doc-a', created_at: '2026-10-01T12:00:00Z', source: 'upload', source_filename: 'maker-original.pdf', created_by: 'original-filer', sha256: 'hash-a' },
    { id: 'print-b', sheet_id: 'sheet-a', print_number: 2, rev_letter: 'B', project_document_id: 'doc-b', created_at: '2026-10-02T12:00:00Z', source: 'upload', source_filename: 'designer-current.pdf', created_by: 'new-lead', sha256: 'hash-b' },
  ],
  packages: [
    { id: 'pkg-a', code: 'CAB', title: 'Same package title', package_key: 'pkg.original', project_room_id: 'room-b', archived_at: '2026-10-03' },
    { id: 'pkg-b', code: 'CAB', title: 'Same package title', package_key: null, project_room_id: 'room-a', archived_at: null },
  ],
  sheetRooms: [{ sheet_id: 'sheet-a', project_room_id: 'room-a' }],
  sheetPackages: [{ sheet_id: 'sheet-a', package_id: 'pkg-a' }],
  issues: [{ id: 'issue', issue_number: 1, name: 'Issued original', issued_at: '2026-10-01T12:00:00Z', set_checksum: 'frozen-checksum' }],
  issuePrints: [{ id: 'snapshot', issue_id: 'issue', sheet_id: 'sheet-a', print_id: 'print-a', sheet_number: 'OLD-201', sheet_title: 'Frozen maker title', rev_letter: 'A', sha256: 'hash-a' }],
  batches: [], transmittals: [], tokens: [],
} as unknown as PlanRoomBundle);
let mockBundle = fixture();
beforeEach(() => { mockBundle = fixture(); });

it('uses exact package IDs despite duplicate names and package home rooms; retains archived identity', () => {
  render(<PlanRoomSet projectId="job" rooms={mockRooms} bundle={mockBundle} onOpenSheet={jest.fn()} onIssue={jest.fn()} onChooseFile={jest.fn()} />);
  const sheet = screen.getByRole('button', { name: /New live title/ });
  expect(sheet).toHaveTextContent('pkg.original');
  expect(sheet).toHaveTextContent('Archived');
  expect(sheet.querySelector('[data-package-id="pkg-b"]')).toBeNull();
  expect(sheet).not.toHaveTextContent('Composition only');
});

it('does not infer room membership from matching titles or a package home room', () => {
  const { container } = render(<DesignChapter projectId="job" routeId="job" onWorkRoom={jest.fn()} />);
  const drawings = screen.getByRole('region', { name: 'Project drawings' });
  const wholeJob = within(drawings).getByRole('region', { name: 'Drawings for the whole job' });
  expect(wholeJob.querySelector('[data-drawing-sheet-id="sheet-b"]')).not.toBeNull();
  expect(wholeJob.querySelector('[data-drawing-sheet-id="sheet-a"]')).toBeNull();
  // Both rooms have the same name: only the exact room-a link may contain this sheet.
  expect(container.querySelectorAll('[data-drawing-sheet-id="sheet-a"]')).toHaveLength(1);
  expect(within(drawings).getAllByRole('region', { name: 'Kitchen' })).toHaveLength(1);
});

it('distinguishes unkeyed composition and unavailable package metadata without erasing links', () => {
  mockBundle.sheetPackages.push({ sheet_id: 'sheet-a', package_id: 'pkg-b', added_by: null, added_at: '' }, { sheet_id: 'sheet-a', package_id: 'hidden-package', added_by: null, added_at: '' });
  render(<PlanSheetDetail projectId="job" sheetId="sheet-a" rooms={mockRooms} bundle={mockBundle} onBack={jest.fn()} onIssue={jest.fn()} />);
  expect(screen.getByText(/Composition only · no agreed-scope key/)).toBeInTheDocument();
  expect(screen.getByText('Linked package unavailable')).toBeInTheDocument();
  expect(screen.getByText(/not an issued package or authority to fabricate/)).toBeInTheDocument();
});

it('keeps issued title and original print provenance after the live sheet and filer advance', async () => {
  render(<PlanIssueHistory bundle={mockBundle} projectId="job" />);
  fireEvent.click(screen.getByText(/Issue 1/));
  const issued = screen.getByText(/OLD-201 · Frozen maker title/).closest('li')!;
  expect(issued).toHaveTextContent('Source: upload · maker-original.pdf · Filed by Morgan Maker');
  expect(issued).not.toHaveTextContent('original-filer');
  expect(issued).not.toHaveTextContent('print-a');
  expect(issued).not.toHaveTextContent('Leah Designer');
  expect(issued.querySelector('[data-print-filer="original-filer"]')).not.toBeNull();
  const opener = within(issued).getByRole('button', { name: 'Open issued print' });
  fireEvent.click(opener);
  const dialog = await screen.findByRole('dialog');
  expect(dialog).toHaveTextContent('Frozen maker title');
  expect(dialog).not.toHaveTextContent('New live title');
  fireEvent.click(within(dialog).getByRole('button', { name: /Back to the document/ }));
  await waitFor(() => expect(opener).toHaveFocus());
});

it('returns each current and historical viewer to its actual trigger and uses the issued title', async () => {
  mockBundle.issues.unshift({ ...mockBundle.issues[0], id: 'later-issue', issue_number: 2 });
  mockBundle.issuePrints.unshift({ ...mockBundle.issuePrints[0], id: 'later-snapshot', issue_id: 'later-issue', sheet_title: 'Later reissue title' });
  render(<PlanSheetDetail projectId="job" sheetId="sheet-a" rooms={mockRooms} bundle={mockBundle} onBack={jest.fn()} onIssue={jest.fn()} />);
  const current = screen.getByRole('button', { name: 'Open drawing revision' });
  // Another focused control must not become the inferred opener.
  screen.getByRole('button', { name: 'Issue current set' }).focus();
  fireEvent.click(current);
  let dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: /Back to the document/ }));
  await waitFor(() => expect(current).toHaveFocus());
  const historical = screen.getAllByRole('button', { name: 'Open revision' })[1];
  current.focus();
  fireEvent.click(historical);
  dialog = await screen.findByRole('dialog');
  expect(dialog).toHaveTextContent('Frozen maker title');
  expect(dialog).not.toHaveTextContent('New live title');
  fireEvent.keyDown(dialog, { key: 'Escape' });
  await waitFor(() => expect(historical).toHaveFocus());
});

it.each(['set', 'detail', 'chapter'])('shows exact linked room and named filer in %s without visible IDs', (surface) => {
  const { container } = render(surface === 'set'
    ? <PlanRoomSet projectId="job" rooms={mockRooms} bundle={mockBundle} onOpenSheet={jest.fn()} onIssue={jest.fn()} onChooseFile={jest.fn()} />
    : surface === 'detail'
      ? <PlanSheetDetail projectId="job" rooms={mockRooms} sheetId="sheet-a" bundle={mockBundle} onBack={jest.fn()} onIssue={jest.fn()} />
      : <DesignChapter projectId="job" routeId="job" onWorkRoom={jest.fn()} />);
  expect(container).toHaveTextContent('Kitchen');
  expect(container).not.toHaveTextContent('room-a');
  expect(container.querySelector('[data-room-id="room-a"]')).not.toBeNull();
  if (surface !== 'set') {
    expect(container).toHaveTextContent('Filed by Leah Designer');
    expect(container).not.toHaveTextContent('new-lead');
  }
});

it('uses neutral unavailable-room copy while retaining the exact link', () => {
  const { container } = render(<PlanSheetComposition bundle={mockBundle} sheetId="sheet-a" rooms={[]} />);
  expect(container).toHaveTextContent('Room no longer on this job');
  expect(container).not.toHaveTextContent('room-a');
  expect(container.querySelector('[data-room-id="room-a"]')).not.toBeNull();
});

it('resolves the exact signed-in filer outside the project roster without relabeling other filers', () => {
  const { container, rerender } = render(<PlanPrintProvenance projectId="job" print={{ ...mockBundle.prints[0], created_by: 'signed-in-filer' }} />);
  expect(container).toHaveTextContent('Filed by Sam Studio');
  expect(container).not.toHaveTextContent('signed-in-filer');
  rerender(<PlanPrintProvenance projectId="job" print={mockBundle.prints[0]} />);
  expect(container).toHaveTextContent('Filed by Morgan Maker');
  expect(container).not.toHaveTextContent('Sam Studio');
  rerender(<PlanPrintProvenance projectId="job" print={{ ...mockBundle.prints[0], created_by: 'missing-filer' }} />);
  expect(container).toHaveTextContent('Filed by a person whose name is unavailable');
  expect(container).not.toHaveTextContent('Sam Studio');
});

it.each([['missing-filer', 'Filed by a person whose name is unavailable'], [null, 'Filer not recorded']])(
  'never prints an unresolved or unrecorded filer ID (%s)', (createdBy, label) => {
    const { container } = render(<PlanPrintProvenance projectId="job" print={{ ...mockBundle.prints[0], created_by: createdBy }} />);
    expect(container).toHaveTextContent(label!);
    expect(container).not.toHaveTextContent('missing-filer');
  },
);
