/**
 * Escalating a field note must carry the whole note. Before this wave NoteBody
 * forwarded `body: row.title`, and the view truncates title to left(body, 80)
 * — so escalating a one-minute transcript produced a client decision whose
 * text was its first eighty characters. §9.4 calls that "the difference
 * between 'works for free' and 'works'".
 *
 * W4-C8 confines that to FIELD notes. The view emits payload.body only when
 * margin_notes.field_capture_id is set; on a TYPED desk note the key is null,
 * readFieldNotePayload falls back to row.title for client decisions.
 * Amendments deliberately carry only a neutral title and note identity after
 * the 011874993/a28b84dae privacy repair, never private body text.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import type { MarginItemRow } from '@/lib/document/margin-derivation';
import { NoteBody } from '../margin-bodies';

const escalate = jest.fn();
const amendmentSeed = jest.fn();

jest.mock('@patina/supabase', () => ({
  createBrowserClient: () => ({}),
  useSessionUserId: () => 'u1',
  useApplyDecisionOverride: () => ({ mutate: jest.fn(), isPending: false }),
  useDecision: () => ({ data: undefined }),
  useDecisionOverrides: () => ({ data: [] }),
  useIssueInvoice: () => ({ mutate: jest.fn(), isPending: false }),
  useInvoice: () => ({ data: undefined }),
  useProjectFFEItems: () => ({ data: [] }),
  useSendDecisionReminder: () => ({ mutate: jest.fn(), isPending: false }),
  useSendInvoice: () => ({ mutate: jest.fn(), isPending: false }),
  useSendMessage: () => ({ mutate: jest.fn(), isPending: false }),
  useThreadMessages: () => ({ data: [] }),
  useUpdateDecision: () => ({ mutate: jest.fn(), isPending: false }),
  useExtendAndReopenDecision: () => ({ mutate: jest.fn(), isPending: false }),
  useCaptureMediaUrls: () => ({ data: undefined, isLoading: false }),
}));
jest.mock('@/lib/document/field-sms', () => ({ describeFieldEffect: () => '' }));
jest.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
jest.mock('@/hooks/use-margin-items', () => ({
  invalidateMarginSurfaces: jest.fn(),
  useSendWeeklyPulse: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock('@/hooks/use-margin-notes', () => ({
  useEscalateNoteToDecision: () => ({ mutate: escalate, isPending: false, isError: false }),
}));
jest.mock('@/components/document/overlays/amendment-sheet', () => ({
  AmendmentSheet: (props: { seed?: unknown }) => {
    amendmentSeed(props.seed);
    return null;
  },
}));
jest.mock('../accounts/invoice-overlays', () => ({ openInvoiceFolio: jest.fn() }));

const LONG =
  'The base cabinet scribe is short on the left return and the filler behind the range needs to be re-cut before the countertop template on Thursday.';

const fieldNote: MarginItemRow = {
  kind: 'note',
  item_id: 'note-1',
  project_id: 'project-1',
  proposal_id: null,
  anchor_kind: 'letterhead',
  anchor_id: null,
  state: 'open',
  title: LONG.slice(0, 80),
  detail: '',
  ts: '2026-08-25T15:00:00Z',
  payload: { body: LONG, field_capture_id: 'capture-1', capture_visible: true, has_audio: true },
};

describe('NoteBody escalation', () => {
  beforeEach(() => {
    escalate.mockReset();
    amendmentSeed.mockReset();
  });

  it('sends the full note to the client decision, not the eighty-character title', () => {
    render(<NoteBody row={fieldNote} projectId="project-1" />);
    fireEvent.click(screen.getByText('→ Client decision'));
    expect(escalate).toHaveBeenCalledWith({
      noteId: 'note-1',
      projectId: 'project-1',
      body: LONG,
    });
  });

  it('seeds the amendment with only the note identity and a neutral title', () => {
    render(<NoteBody row={fieldNote} projectId="project-1" />);
    expect(amendmentSeed).toHaveBeenCalledWith({
      noteId: 'note-1', title: 'Amendment from a studio note',
    });
    expect(amendmentSeed.mock.calls[0][0]).not.toHaveProperty('description');
  });

  it('keeps private text and its truncated fragments out of the amendment seed', () => {
    render(<NoteBody row={fieldNote} projectId="project-1" />);
    const seed = amendmentSeed.mock.calls[0][0];
    expect(seed.title.length).toBeLessThanOrEqual(70);
    expect(seed.description).toBeUndefined();
    expect(JSON.stringify(seed)).not.toContain(LONG);
    expect(JSON.stringify(seed)).not.toContain(LONG.slice(0, 64));
  });
});

// W4-C8 still pins the typed note's client-decision fallback to its title.
// The amendment privacy repair must also exclude that truncated private text.
describe('NoteBody escalation — a typed desk note (W4-C8)', () => {
  const typedNote: MarginItemRow = {
    ...fieldNote,
    item_id: 'note-2',
    title: LONG.slice(0, 80),
    // The margin migration's note branch: body is null unless
    // field_capture_id is set, and the whole field lane reads null/false/[].
    payload: {
      body: null,
      field_capture_id: null,
      capture_visible: false,
      has_audio: false,
      photo_paths: [],
    },
  };

  beforeEach(() => {
    escalate.mockReset();
    amendmentSeed.mockReset();
  });

  it('sends the eighty-character title to the client decision, not a full body', () => {
    render(<NoteBody row={typedNote} projectId="project-1" />);
    fireEvent.click(screen.getByText('→ Client decision'));
    expect(escalate).toHaveBeenCalledWith({
      noteId: 'note-2',
      projectId: 'project-1',
      body: LONG.slice(0, 80),
    });
    expect(escalate).not.toHaveBeenCalledWith(
      expect.objectContaining({ body: LONG }),
    );
  });

  it('keeps the typed note title out of the neutral amendment seed too', () => {
    render(<NoteBody row={typedNote} projectId="project-1" />);
    const seed = amendmentSeed.mock.calls[0][0];
    expect(amendmentSeed).toHaveBeenCalledWith({
      noteId: 'note-2', title: 'Amendment from a studio note',
    });
    expect(seed).not.toHaveProperty('description');
    expect(JSON.stringify(seed)).not.toContain(LONG);
    expect(JSON.stringify(seed)).not.toContain(typedNote.title);
    expect(JSON.stringify(seed)).not.toContain(LONG.slice(0, 64));
  });

  it('renders no body paragraph — a typed note would print its text twice', () => {
    render(<NoteBody row={typedNote} projectId="project-1" />);
    expect(screen.queryByText(LONG.slice(0, 80))).not.toBeInTheDocument();
  });
});
