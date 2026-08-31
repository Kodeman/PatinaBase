/**
 * Escalating a field note must carry the whole note. Before this wave NoteBody
 * forwarded `body: row.title`, and the view truncates title to left(body, 80)
 * — so escalating a one-minute transcript produced a client decision whose
 * text was its first eighty characters. §9.4 calls that "the difference
 * between 'works for free' and 'works'".
 *
 * W4-C8 confines that to FIELD notes. The view emits payload.body only when
 * margin_notes.field_capture_id is set; on a TYPED desk note the key is null,
 * readFieldNotePayload falls back to row.title, and both escalations stay
 * byte-identical to their pre-wave behaviour. Both branches are pinned below —
 * the field one because it is the point of the wave, the typed one because
 * widening it is an undeclared behaviour change W4-C8 refuses.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import type { MarginItemRow } from '@/lib/document/margin-derivation';
import { NoteBody } from '../margin-bodies';

const escalate = jest.fn();
const amendmentSeed = jest.fn();

jest.mock('@patina/supabase', () => ({
  createBrowserClient: () => ({}),
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

  it('seeds the amendment with the full note as its description', () => {
    render(<NoteBody row={fieldNote} projectId="project-1" />);
    expect(amendmentSeed).toHaveBeenCalledWith(
      expect.objectContaining({ description: LONG, noteId: 'note-1' }),
    );
  });

  it('keeps the amendment title short enough to read in a heading', () => {
    render(<NoteBody row={fieldNote} projectId="project-1" />);
    const seed = amendmentSeed.mock.calls[0][0] as { title: string };
    expect(seed.title.length).toBeLessThanOrEqual(70);
    expect(seed.title.endsWith('…')).toBe(true);
  });
});

// ── W4-C8: the typed desk note is the OTHER branch, and it must not have moved.
// The view emits a null payload.body for it, so escalating and amending both
// carry left(body, 80) — the eighty-character title — exactly as before the
// wave. A regression here is the view emitting `n.body` unconditionally again.
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

  it('seeds the amendment from the title too', () => {
    render(<NoteBody row={typedNote} projectId="project-1" />);
    expect(amendmentSeed).toHaveBeenCalledWith(
      expect.objectContaining({ description: LONG.slice(0, 80), noteId: 'note-2' }),
    );
  });

  it('renders no body paragraph — a typed note would print its text twice', () => {
    render(<NoteBody row={typedNote} projectId="project-1" />);
    expect(screen.queryByText(LONG.slice(0, 80))).not.toBeInTheDocument();
  });
});
