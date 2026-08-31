/**
 * NoteBody — the field-note lane (§9.4 + §8.5). Before wave 4 this component
 * rendered the author and the two escalation actions and NEVER the body
 * (margin-bodies.tsx:814-895), so a site transcript reached the Document as
 * its first eighty characters. Mocking shape mirrors
 * letterhead-instruments-scan-door.test.tsx: mock the @patina/supabase barrel
 * plus every app-local hook margin-bodies.tsx imports, and stub the sheets.
 */
import { render, screen } from '@testing-library/react';
import type { MarginItemRow } from '@/lib/document/margin-derivation';
import { NoteBody } from '../margin-bodies';

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
  useEscalateNoteToDecision: () => ({ mutate: jest.fn(), isPending: false, isError: false }),
}));
jest.mock('@/components/document/overlays/amendment-sheet', () => ({
  AmendmentSheet: () => null,
}));
jest.mock('../accounts/invoice-overlays', () => ({ openInvoiceFolio: jest.fn() }));

const LONG =
  'The base cabinet scribe is short on the left return and the filler behind the range needs to be re-cut before the countertop template on Thursday.';

function row(payload: Record<string, unknown>, title: string): MarginItemRow {
  return {
    kind: 'note',
    item_id: 'note-1',
    project_id: 'project-1',
    proposal_id: null,
    anchor_kind: 'letterhead',
    anchor_id: null,
    state: 'open',
    title,
    detail: '',
    ts: '2026-08-25T15:00:00Z',
    payload,
  };
}

describe('NoteBody — the field note', () => {
  it('renders the whole spoken note, not its first eighty characters', () => {
    render(
      <NoteBody
        row={row({ body: LONG, field_capture_id: 'capture-1', capture_visible: true, has_audio: true }, LONG.slice(0, 80))}
        projectId="project-1"
      />,
    );
    expect(screen.getByText(LONG)).toBeInTheDocument();
  });

  it('says once that the transcript is a first reading, and never says how', () => {
    render(
      <NoteBody
        row={row({ body: LONG, field_capture_id: 'capture-1', capture_visible: true, has_audio: true }, 'x')}
        projectId="project-1"
      />,
    );
    expect(screen.getByText('A first reading. The recording is here.')).toBeInTheDocument();
  });

  it('explains a recording it cannot open instead of dropping it silently', () => {
    render(
      <NoteBody
        row={row({ body: LONG, field_capture_id: 'capture-1', capture_visible: false, has_audio: false }, 'x')}
        projectId="project-1"
      />,
    );
    expect(screen.getByText('The recording is the author’s.')).toBeInTheDocument();
    expect(screen.queryByText('A first reading. The recording is here.')).not.toBeInTheDocument();
  });

  it('leaves a typed R14 note exactly as it was — no body paragraph, no field chrome', () => {
    render(
      <NoteBody
        row={row({ author_name: 'Leah Kochaver' }, 'Ask about the runner.')}
        projectId="project-1"
      />,
    );
    // FC-R10: a field-less note renders byte-identically to how it did before
    // this wave — no body paragraph. Without the field.fieldCaptureId gate,
    // NoteBody prints <p>{field.body}</p> unconditionally and field.body falls
    // back to row.title, so this exact text would appear; this assertion
    // fails the moment that gate is reverted.
    expect(screen.queryByText('Ask about the runner.')).not.toBeInTheDocument();
    expect(screen.queryByTestId(/field-note-audio-/)).not.toBeInTheDocument();
    expect(screen.queryByText('A first reading. The recording is here.')).not.toBeInTheDocument();
    expect(screen.queryByText('The recording is the author’s.')).not.toBeInTheDocument();
    expect(screen.getByText('Leah Kochaver')).toBeInTheDocument();
  });

  it('shows a photo-only field note today: media renders, no first-reading line', () => {
    render(
      <NoteBody
        row={row(
          {
            body: LONG,
            field_capture_id: 'capture-1',
            capture_visible: true,
            has_audio: false,
            photo_paths: ['a/photo-0.heic'],
          },
          LONG.slice(0, 80),
        )}
        projectId="project-1"
      />,
    );
    expect(screen.getByText(LONG)).toBeInTheDocument();
    expect(screen.queryByText('A first reading. The recording is here.')).not.toBeInTheDocument();
    expect(screen.queryByText('The recording is the author’s.')).not.toBeInTheDocument();
  });

  it('still renders the escalated line rather than a body', () => {
    render(
      <NoteBody
        row={{ ...row({ escalated_to_decision_id: 'd1', body: LONG }, 'x'), state: 'escalated' }}
        projectId="project-1"
      />,
    );
    expect(screen.getByText(/Escalated — now a client decision/)).toBeInTheDocument();
  });
});
