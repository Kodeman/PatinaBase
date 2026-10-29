import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NoteBody } from '../../margin-bodies';
import { registerUnfoldOpener } from '../../paper/unfold-bridge';
import type { MarginItemRow } from '@/lib/document/margin-derivation';

const mockEscalate = jest.fn();
const mockMedia = jest.fn();
const mockCompose = jest.fn();
const mockOpenUnfold = jest.fn();
let mockRenderer = 'round8';
let clearOpener: () => void = () => {};
jest.mock('@/hooks/use-paper-renderer', () => ({ usePaperRenderer: () => ({ renderer: mockRenderer }) }));
jest.mock('@patina/supabase', () => ({
  useProjectV2: () => ({ data: { id: 'project', name: 'Fictional house', proposal: null } }),
  useScopeChangeRequests: () => ({ data: [] }),
  useAcceptClientScopeChangeRequest: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: { id: 'author' } }) }));
jest.mock('@/hooks/use-margin-items', () => ({ invalidateMarginSurfaces: jest.fn(), useSendWeeklyPulse: jest.fn() }));
jest.mock('@/hooks/use-margin-notes', () => ({
  useEscalateNoteToDecision: () => ({ mutate: mockEscalate, isPending: false, isError: false }),
}));
jest.mock('@/hooks/use-amendments', () => ({
  useComposeAmendment: () => ({ mutate: mockCompose, isPending: false }),
  useSendAmendment: () => ({ mutate: jest.fn(), isPending: false }),
  useApplyAmendment: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock('../../overlays/household-sheet', () => ({ HouseholdSheet: () => null }));
jest.mock('../../accounts/invoice-overlays', () => ({ openInvoiceFolio: jest.fn() }));
jest.mock('../../field-note-media', () => ({ FieldNoteMedia: (props: unknown) => { mockMedia(props); return <span>Visible capture media</span>; } }));
jest.mock('@/lib/analytics/document-events', () => ({ documentEvents: {
  actionShown: jest.fn(), actionSelected: jest.fn(), regionFolded: jest.fn(),
} }));
jest.mock('@/lib/help-system/open-help', () => ({ openHelp: jest.fn() }));

function note(payload: Record<string, unknown> = {}): MarginItemRow {
  return { kind: 'note', item_id: 'note', project_id: 'project', proposal_id: null,
    anchor_kind: 'letterhead', anchor_id: null, state: 'open', title: 'Observation',
    detail: '', ts: '2026-10-26T00:00:00Z', payload };
}
function show(payload: Record<string, unknown> = {}) {
  return render(<NoteBody row={note(payload)} projectId="project" />);
}
function value(label: string) {
  const term = within(screen.getByLabelText('Note context')).getByText(label, { selector: 'dt' });
  return term.nextElementSibling!;
}
function expectNoVisibleUuid() {
  expect(screen.getByLabelText('Note context').textContent)
    .not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
}
beforeEach(() => { mockEscalate.mockClear(); mockMedia.mockClear(); mockCompose.mockClear(); mockOpenUnfold.mockClear(); mockRenderer = 'round8'; });
afterEach(() => { clearOpener(); clearOpener = () => {}; jest.restoreAllMocks(); });
/** Click the room link; `followed` is true when its default (the href) was
 *  left to run. jsdom's own navigation is then cancelled at the window. */
function clickRoom(before?: () => void) {
  render(<NoteBody row={note({ subject_kind: 'project_room', subject_id: 'room', subject_room_name: 'Kitchen' })} projectId="project" onBeforeRoomOpen={before} />);
  const link = screen.getByRole('link');
  let followed = false;
  const settle = (event: Event) => { followed = !event.defaultPrevented; event.preventDefault(); };
  window.addEventListener('click', settle);
  fireEvent.click(link);
  window.removeEventListener('click', settle);
  return { link, followed };
}

describe('contextual Field reading', () => {
  it.each([
    ['plan_print', 'Print', 'd2f47188-61f4-4bf1-b843-f62e67218633', 'subject_print_label', 'A-201 rev B · Kitchen elevation'],
    ['plan_issue', 'Issue', 'a5fbdb65-5bea-4c86-87b8-b4c6b60689fd', 'subject_issue_label', 'Issue 2 · Drawing set'],
  ] as const)(
    'reads labeled %s provenance without inventing adjacent lineage or acceptance', (kind, label, id, key, humanLabel) => {
      show({ subject_kind: kind, subject_id: id, [key]: humanLabel, author_name: 'Fictional author' });
      expect(value('Subject')).toHaveTextContent(kind === 'plan_issue' ? humanLabel : `${label} · ${humanLabel}`);
      expect(value(label)).toHaveTextContent(humanLabel);
      expect(screen.getByLabelText('Note context')).not.toHaveTextContent(id);
      expectNoVisibleUuid();
      for (const unknown of ['Room', 'Scope', 'Next owner', label === 'Print' ? 'Issue' : 'Print']) {
        expect(value(unknown)).toHaveTextContent('Not recorded');
      }
      expect(value('Author')).toHaveTextContent('Fictional author');
      expect(value('Source')).toHaveTextContent('Studio note');
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
      expect(screen.queryByText(/accepted|completed/i)).not.toBeInTheDocument();
    },
  );

  it('returns only to the room recorded on a visible capture', () => {
    const captureId = '2a12cc14-d425-44a2-afbb-4e66c4181032';
    const roomId = '815ab96d-7a48-4e06-8168-f3816c9cb98e';
    show({ field_capture_id: captureId, capture_visible: true, project_room_id: roomId,
      capture_room_name: 'Kitchen', capture_title: 'Site survey', capture_kind: 'note', capture_date: '2026-10-26T12:00:00Z', author_name: 'Fictional author' });
    expect(value('Source')).toHaveTextContent('Field capture · Site survey · 26 October');
    expect(screen.getByRole('link', { name: 'Return to room · Kitchen' }))
      .toHaveAttribute('href', `/doc/project?unfold=pieces&lens=spec&room=${roomId}`);
    expect(screen.getByLabelText('Note context')).not.toHaveTextContent(captureId);
    expect(screen.getByLabelText('Note context')).not.toHaveTextContent(roomId);
    expectNoVisibleUuid();
    expect(mockMedia).toHaveBeenCalled();
  });

  it('keeps the room return usable without claiming a hidden room is untitled', () => {
    const roomId = '1432fd92-b0ca-4bb4-b7fd-90c6b634692c';
    show({ field_capture_id: '5eb1a898-73b2-4f86-b7e9-58521ac0b69f', capture_visible: true,
      project_room_id: roomId, capture_kind: 'note' });
    expect(screen.getByRole('link', { name: 'Return to room' }))
      .toHaveAttribute('href', `/doc/project?unfold=pieces&lens=spec&room=${roomId}`);
    expectNoVisibleUuid();
  });

  it.each([
    ['ffe_item', 'FF&E item', 'subject_ffe_label', 'Oak table'],
    ['purchase_order', 'Purchase order', 'subject_order_label', 'PO-104'],
    ['coordination_item', 'Coordination item', 'subject_coordination_label', 'Confirm fabric'],
    ['project_package', 'Project package', 'subject_package_label', 'CAB-01 · Cabinetry'],
  ] as const)('shows the recorded %s label or only its kind when hidden', (kind, kindLabel, key, label) => {
    const id = '3a314327-32ad-42ee-bb39-cd928c186d46';
    const first = show({ subject_kind: kind, subject_id: id, [key]: label });
    expect(value('Subject').textContent).toBe(`${kindLabel} · ${label}`);
    expectNoVisibleUuid();
    first.unmount();
    show({ subject_kind: kind, subject_id: id });
    expect(value('Subject').textContent).toBe(kindLabel);
    expectNoVisibleUuid();
  });

  it('does not infer a room or private media from an invisible capture', () => {
    const captureId = 'da53547c-8e22-4843-b715-178589706fbb';
    const roomId = '8692f45b-6764-4b61-aec3-af76a601d865';
    show({ field_capture_id: captureId, capture_visible: false, project_room_id: roomId,
      capture_title: 'Private capture', capture_room_name: 'Private bedroom',
      audio_path: 'private-audio', photo_paths: ['private-photo'], has_audio: true });
    expect(value('Source')).toHaveTextContent('Field capture unavailable');
    expect(value('Room')).toHaveTextContent('Not recorded');
    expectNoVisibleUuid();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByText(/private-audio|private-photo|Private bedroom|Private capture/)).not.toBeInTheDocument();
    expect(mockMedia).not.toHaveBeenCalled();
    expect(screen.getByText('The capture is unavailable to you.')).toBeInTheDocument();
    expect(screen.queryByText(/author’s/)).not.toBeInTheDocument();
  });

  it('preserves an explicit project-room subject independently of unavailable capture metadata', () => {
    const roomId = 'f2b76be9-597e-46f1-8a2f-0b9069f91862';
    show({ subject_kind: 'project_room', subject_id: roomId, subject_room_name: 'Living room', field_capture_id: '4dfd18db-8f0e-40fd-90d4-50af5cf095d1',
      capture_visible: false, project_room_id: '7321c8e6-76ae-439a-b486-376f5351c81f', capture_room_name: 'Private bedroom' });
    expect(value('Subject')).toHaveTextContent('Room · Living room');
    expect(screen.getByRole('link', { name: 'Return to room · Living room' })).toHaveAttribute('href', `/doc/project?unfold=pieces&lens=spec&room=${roomId}`);
    expectNoVisibleUuid();
    expect(screen.queryByText(/Private bedroom/)).not.toBeInTheDocument();
  });

  it('shows only the kind when a subject label is not visible', () => {
    const id = '4b88235c-5ad3-4e89-a1c2-94e4fc7d2420';
    show({ subject_kind: 'plan_print', subject_id: id, field_capture_id: id,
      capture_visible: true, capture_kind: 'note', capture_date: '2026-10-26T12:00:00Z' });
    expect(value('Subject').textContent).toBe('Print');
    expect(value('Print').textContent).toBe('Print');
    expect(value('Source')).toHaveTextContent('Field capture · note · 26 October');
    expectNoVisibleUuid();
    expect(screen.getByLabelText('Note context')).not.toHaveTextContent(id);
  });

  it('labels a visible capture subject without printing its id', () => {
    const id = 'fbbf7cc2-501d-4987-8452-8bde432acb28';
    show({ subject_kind: 'field_capture', subject_id: id,
      subject_capture_title: 'Material sample', subject_capture_kind: 'specimen', subject_capture_date: '2026-10-26T12:00:00Z' });
    expect(value('Subject')).toHaveTextContent('Field capture · Material sample · 26 October');
    expect(screen.getByLabelText('Note context')).not.toHaveTextContent(id);
  });

  it('opens the native room owner with the actual clicked control', () => {
    clearOpener = registerUnfoldOpener('project', mockOpenUnfold);
    const before = jest.fn();
    const { link, followed } = clickRoom(before);
    expect(followed).toBe(false);
    expect(before).toHaveBeenCalledTimes(1);
    expect(mockOpenUnfold).toHaveBeenCalledTimes(1);
    expect(mockOpenUnfold).toHaveBeenCalledWith(
      { kind: 'pieces', lens: 'spec', room: 'room', line: null },
      { documentId: 'project', chapter: 'ffe', room: 'room', lens: 'spec' }, link);
  });

  it('follows the room link when no round-8 frame has registered an opener', () => {
    const before = jest.fn();
    const { followed } = clickRoom(before);
    expect(followed).toBe(true);
    expect(before).toHaveBeenCalledTimes(1);
    expect(mockOpenUnfold).not.toHaveBeenCalled();
  });

  it('follows the room link when the registered opener belongs to another document', () => {
    clearOpener = registerUnfoldOpener('another-project', mockOpenUnfold);
    const { followed } = clickRoom();
    expect(followed).toBe(true);
    expect(mockOpenUnfold).not.toHaveBeenCalled();
  });

  it('keeps a cleared registration from opening a later click', () => {
    registerUnfoldOpener('project', mockOpenUnfold)();
    expect(clickRoom().followed).toBe(true);
    expect(mockOpenUnfold).not.toHaveBeenCalled();
  });

  it('uses the existing pieces route under the legacy renderer', () => {
    mockRenderer = 'legacy';
    clearOpener = registerUnfoldOpener('project', mockOpenUnfold);
    const before = jest.fn();
    const { link, followed } = clickRoom(before);
    expect(link).toHaveAttribute('href', '/doc/project/pieces?lens=spec&room=room');
    expect(followed).toBe(true);
    expect(before).toHaveBeenCalledTimes(1);
    expect(mockOpenUnfold).not.toHaveBeenCalled();
  });

  it('shows metadata unavailability without dropping the note body', () => {
    show({ context_unavailable: true, body: 'Retained observation', field_capture_id: 'capture' });
    expect(screen.getByRole('status')).toHaveTextContent('Note context is unavailable');
    expect(screen.getByText('Retained observation')).toBeVisible();
  });

  it('saves an unedited Amendment draft with no private note text', async () => {
    const sentinel = 'PRIVATE FIELD NOTE MUST NOT LEAVE THE MARGIN';
    show({ body: sentinel });
    fireEvent.click(screen.getByRole('button', { name: '→ Amendment' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Save as draft' }));
    expect(mockCompose).toHaveBeenCalledTimes(1);
    const payload = mockCompose.mock.calls[0][0];
    expect(payload).toMatchObject({ title: 'Amendment from a studio note', description: '', noteId: 'note', send: false });
    expect(JSON.stringify(payload)).not.toContain(sentinel);
  });

  it('leaves absent legacy lineage explicitly unrecorded', () => {
    show({ author_name: 'Legacy author' });
    for (const label of ['Subject', 'Room', 'Print', 'Issue', 'Scope', 'Next owner']) {
      expect(value(label)).toHaveTextContent('Not recorded');
    }
    expect(screen.getAllByText('Legacy author')).toHaveLength(1);
  });

  it('keeps inactive atomic escalation unavailable while preserving the existing draft act', () => {
    show({ body: 'Private observation' });
    expect(screen.getByText('Atomic escalation is unavailable.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '→ Client decision' }));
    expect(mockEscalate).toHaveBeenCalledWith({ noteId: 'note', projectId: 'project', body: 'Private observation' });
  });

  it('returns the real Amendment sheet to the actual click trigger without prefocusing it', async () => {
    jest.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(() => [{}] as unknown as DOMRectList);
    show({ body: 'Retain the observation in a draft' });
    const trigger = screen.getByRole('button', { name: '→ Amendment' });
    expect(trigger).not.toHaveFocus();
    fireEvent.click(trigger);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible());
    expect(screen.queryByDisplayValue('Retain the observation in a draft')).not.toBeInTheDocument();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
