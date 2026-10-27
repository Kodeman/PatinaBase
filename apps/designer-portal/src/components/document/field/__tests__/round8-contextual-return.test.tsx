import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NoteBody } from '../../margin-bodies';
import type { MarginItemRow } from '@/lib/document/margin-derivation';

const mockEscalate = jest.fn();
const mockMedia = jest.fn();
const mockCompose = jest.fn();
const mockOpenUnfold = jest.fn();
let mockRenderer = 'round8';
jest.mock('@/hooks/use-paper-renderer', () => ({ usePaperRenderer: () => ({ renderer: mockRenderer }) }));
jest.mock('../../paper/unfold-instrument', () => ({ openUnfold: (...args: unknown[]) => mockOpenUnfold(...args) }));
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
beforeEach(() => { mockEscalate.mockClear(); mockMedia.mockClear(); mockCompose.mockClear(); mockOpenUnfold.mockClear(); mockRenderer = 'round8'; });
afterEach(() => jest.restoreAllMocks());

describe('contextual Field reading', () => {
  it.each([['plan_print', 'Print', 'print-exact'], ['plan_issue', 'Issue', 'issue-exact']] as const)(
    'reads exact %s provenance without inventing adjacent lineage or acceptance', (kind, label, id) => {
      show({ subject_kind: kind, subject_id: id, author_name: 'Fictional author' });
      expect(value('Subject')).toHaveTextContent(`${kind.replaceAll('_', ' ')} · ${id}`);
      expect(value(label)).toHaveTextContent(id);
      for (const unknown of ['Room', 'Scope', 'Next owner', label === 'Print' ? 'Issue' : 'Print']) {
        expect(value(unknown)).toHaveTextContent('Not recorded');
      }
      expect(value('Author')).toHaveTextContent('Fictional author');
      expect(value('Source')).toHaveTextContent('Studio note · note');
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
      expect(screen.queryByText(/accepted|completed/i)).not.toBeInTheDocument();
    },
  );

  it('returns only to the room recorded on a visible capture', () => {
    show({ field_capture_id: 'capture-exact', capture_visible: true, project_room_id: 'room-exact', author_name: 'Fictional author' });
    expect(value('Source')).toHaveTextContent('Field capture · capture-exact');
    expect(screen.getByRole('link', { name: 'Return to room · room-exact' }))
      .toHaveAttribute('href', '/doc/project?unfold=pieces&lens=spec&room=room-exact');
    expect(mockMedia).toHaveBeenCalled();
  });

  it('does not infer a room or private media from an invisible capture', () => {
    show({ field_capture_id: 'capture-exact', capture_visible: false, project_room_id: 'private-room',
      audio_path: 'private-audio', photo_paths: ['private-photo'], has_audio: true });
    expect(value('Room')).toHaveTextContent('Not recorded');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByText(/private-room|private-audio|private-photo/)).not.toBeInTheDocument();
    expect(mockMedia).not.toHaveBeenCalled();
    expect(screen.getByText('The capture is unavailable to you.')).toBeInTheDocument();
    expect(screen.queryByText(/author’s/)).not.toBeInTheDocument();
  });

  it('preserves an explicit project-room subject independently of unavailable capture metadata', () => {
    show({ subject_kind: 'project_room', subject_id: 'explicit-room', field_capture_id: 'capture',
      capture_visible: false, project_room_id: 'private-room' });
    expect(screen.getByRole('link')).toHaveAttribute('href', '/doc/project?unfold=pieces&lens=spec&room=explicit-room');
    expect(screen.queryByText(/private-room/)).not.toBeInTheDocument();
  });

  it('opens the native room owner with the actual clicked control', () => {
    const before = jest.fn();
    render(<NoteBody row={note({ subject_kind: 'project_room', subject_id: 'room' })} projectId="project" onBeforeRoomOpen={before} />);
    const link = screen.getByRole('link');
    fireEvent.click(link);
    expect(before).toHaveBeenCalledTimes(1);
    expect(mockOpenUnfold).toHaveBeenCalledWith(
      { kind: 'pieces', lens: 'spec', room: 'room', line: null },
      { documentId: 'project', chapter: 'ffe', room: 'room', lens: 'spec' }, link);
  });

  it('uses the existing pieces route under the legacy renderer', () => {
    mockRenderer = 'legacy';
    show({ subject_kind: 'project_room', subject_id: 'room' });
    expect(screen.getByRole('link')).toHaveAttribute('href', '/doc/project/pieces?lens=spec&room=room');
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
