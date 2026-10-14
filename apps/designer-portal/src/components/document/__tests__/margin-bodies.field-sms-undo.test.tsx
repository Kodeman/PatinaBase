/**
 * FieldSmsBody — the quiet Undo on a text Patina applied by itself (V23 R2,
 * 00787). Mocking shape mirrors margin-bodies.field-note.test.tsx: mock the
 * @patina/supabase barrel plus every app-local hook margin-bodies.tsx imports.
 * The revert mutation answers with the outcome each case names.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import type { MarginItemRow } from '@/lib/document/margin-derivation';
import { FieldSmsBody } from '../margin-bodies';

const mockRevert = jest.fn();
const mockUseModelApplies = jest.fn();
const mockRefetchApplies = jest.fn();
const mockState: {
  applies: Array<Record<string, unknown>>;
  historyError: boolean;
  outcome: 'restored' | 'conflict' | 'already' | 'error';
} = { applies: [], historyError: false, outcome: 'restored' };

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
  useModelApplies: (filter: { enabled?: boolean; projectId?: string | null; sourceId?: string | null }) => {
    mockUseModelApplies(filter);
    return {
      data:
        filter.enabled === false
          ? undefined
          : mockState.applies.filter((apply) => !filter.sourceId || apply.source_id === filter.sourceId),
      isError: mockState.historyError,
      refetch: mockRefetchApplies,
    };
  },
  useRevertModelApply: () => ({
    isPending: false,
    mutate: (
      input: unknown,
      opts: { onSuccess?: (r: unknown) => void; onError?: (e: unknown) => void },
    ) => {
      mockRevert(input);
      if (mockState.outcome === 'error') opts.onError?.(new Error('boom'));
      else opts.onSuccess?.({ outcome: mockState.outcome, sourceId: 'sms-1' });
    },
  }),
}));
jest.mock('@/lib/document/field-sms', () => ({
  describeFieldEffect: () => 'Move Rough-in plumbing to Tue',
}));
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

const SUMMARY = 'Rough-in plumbing marked done';

function apply(overrides: Record<string, unknown> = {}) {
  return {
    id: 'apply-1',
    studio_id: 'studio-1',
    project_id: 'project-1',
    source: 'sms',
    source_id: 'sms-1',
    effect_type: 'mark_done',
    target_table: 'project_tasks',
    target_id: 'task-1',
    inserted: false,
    summary: SUMMARY,
    applied_at: '2026-10-13T15:00:00Z',
    reverted_at: null,
    revert_outcome: null,
    project: { id: 'project-1', name: 'Maple' },
    ...overrides,
  };
}

function smsRow(
  appliedEffect: Record<string, unknown> | null = { summary_text: SUMMARY },
  state = 'logged',
): MarginItemRow {
  return {
    kind: 'field_sms',
    item_id: 'sms-1',
    project_id: 'project-1',
    proposal_id: null,
    anchor_kind: 'letterhead',
    anchor_id: null,
    state,
    title: 'Sal',
    detail: 'Rough-in is done',
    ts: '2026-10-13T15:00:00Z',
    payload: { party_id: 'party-1', party_kind: 'trade', applied_effect: appliedEffect },
  };
}

const undoButton = () => screen.queryByRole('button', { name: /^Undo/ });

beforeEach(() => {
  mockRevert.mockReset();
  mockUseModelApplies.mockReset();
  mockRefetchApplies.mockReset();
  mockState.applies = [apply()];
  mockState.historyError = false;
  mockState.outcome = 'restored';
});

describe('FieldSmsBody — quiet Undo on an applied text', () => {
  it('offers Undo after the applied line when an unreverted apply matches', () => {
    render(<FieldSmsBody row={smsRow()} />);
    expect(mockUseModelApplies).toHaveBeenCalledWith({
      projectId: 'project-1',
      sourceId: 'sms-1',
      enabled: true,
    });
    expect(screen.getByText(`Applied · ${SUMMARY}`)).toBeInTheDocument();
    expect(undoButton()).toHaveAccessibleName(`Undo — ${SUMMARY}`);
  });

  it('restored: the line reads "Undone." and focus moves to it', () => {
    render(<FieldSmsBody row={smsRow()} />);
    fireEvent.click(undoButton()!);
    expect(mockRevert).toHaveBeenCalledWith({ sourceId: 'sms-1', projectId: 'project-1' });
    const line = screen.getByText('Undone.');
    expect(line).toHaveFocus();
    expect(undoButton()).toBeNull();
  });

  it('conflict: says it changed since, leaves it, and offers no Undo again', () => {
    mockState.outcome = 'conflict';
    render(<FieldSmsBody row={smsRow()} />);
    fireEvent.click(undoButton()!);
    const line = screen.getByText(`Applied · ${SUMMARY} · Changed since — left as is.`);
    expect(line).toHaveFocus();
    expect(undoButton()).toBeNull();
    expect(screen.queryByText('Undone.')).toBeNull();
  });

  it('already: reads "Undone."', () => {
    mockState.outcome = 'already';
    render(<FieldSmsBody row={smsRow()} />);
    fireEvent.click(undoButton()!);
    expect(screen.getByText('Undone.')).toBeInTheDocument();
    expect(undoButton()).toBeNull();
  });

  it('reverted on load (applied_effect.reverted): "Applied · … · Undone", no Undo', () => {
    mockState.applies = [apply({ reverted_at: '2026-10-13T16:00:00Z', revert_outcome: 'restored' })];
    render(<FieldSmsBody row={smsRow({ summary_text: SUMMARY, reverted: true })} />);
    expect(screen.getByText(`Applied · ${SUMMARY} · Undone`)).toBeInTheDocument();
    expect(undoButton()).toBeNull();
  });

  it('reverted on load from the log alone: every matching apply is reverted', () => {
    mockState.applies = [apply({ reverted_at: '2026-10-13T16:00:00Z', revert_outcome: 'restored' })];
    render(<FieldSmsBody row={smsRow()} />);
    expect(screen.getByText(`Applied · ${SUMMARY} · Undone`)).toBeInTheDocument();
    expect(undoButton()).toBeNull();
  });

  it('offers no Undo for an applied text with no matching apply (reviewed by hand)', () => {
    mockState.applies = [apply({ source_id: 'sms-other' })];
    render(<FieldSmsBody row={smsRow()} />);
    expect(screen.getByText(`Applied · ${SUMMARY}`)).toBeInTheDocument();
    expect(undoButton()).toBeNull();
  });

  it('offers no Undo on a needs-review text', () => {
    render(<FieldSmsBody row={smsRow(null, 'needs_review')} />);
    expect(screen.getByText('Proposed · Move Rough-in plumbing to Tue')).toBeInTheDocument();
    expect(undoButton()).toBeNull();
  });

  it('history read error keeps the Applied summary, offers retry, and withholds Undo', () => {
    mockState.historyError = true;
    render(<FieldSmsBody row={smsRow()} />);

    expect(screen.getByText(`Applied · ${SUMMARY}`)).toBeInTheDocument();
    expect(screen.getByText('Could not load applied texts.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(mockRefetchApplies).toHaveBeenCalledTimes(1);
    expect(undoButton()).toBeNull();
  });

  it('a failed Undo says so on its line and keeps Undo offered', () => {
    mockState.outcome = 'error';
    render(<FieldSmsBody row={smsRow()} />);
    fireEvent.click(undoButton()!);
    expect(screen.getByRole('alert')).toHaveTextContent('Undo did not save. Try again.');
    expect(screen.getByText(`Applied · ${SUMMARY}`)).toBeInTheDocument();
    expect(undoButton()).not.toBeNull();
  });
});
