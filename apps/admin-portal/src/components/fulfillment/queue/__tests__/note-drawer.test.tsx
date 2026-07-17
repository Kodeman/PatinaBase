import { render, screen, fireEvent } from '@testing-library/react';
import { NoteDrawer } from '@/components/fulfillment/queue/note-drawer';
import type { FulfillmentQueueRow } from '@patina/fulfillment';

// Mirrors morning-brief-panel.test.tsx's pattern: mock the hook module, keep
// the pure helpers (findPendingDraft) real via requireActual — the drawer's
// unedited-fast-path vs edited-demotion behavior IS the pure resolveNoteSendMode/
// resolveNoteDrawerSendAction logic from @patina/fulfillment (unit-tested
// exhaustively in packages/fulfillment/src/__tests__/notify.test.ts); this
// suite proves the DRAWER wires that logic to the keyboard/button correctly.
const mockSendMutate = jest.fn();
const mockDraftMutate = jest.fn();
const mockToast = jest.fn();

jest.mock('@/hooks/use-fulfillment-notifications', () => {
  const actual = jest.requireActual('@/hooks/use-fulfillment-notifications');
  return {
    ...actual,
    useOrderNotifications: jest.fn(),
    useDraftClientNote: jest.fn(),
    useSendClientNote: jest.fn(),
  };
});
jest.mock('@/components/portal/toast-provider', () => ({
  useToast: () => ({ toast: mockToast }),
}));

import {
  useDraftClientNote,
  useOrderNotifications,
  useSendClientNote,
} from '@/hooks/use-fulfillment-notifications';

const mockUseOrderNotifications = useOrderNotifications as jest.Mock;
const mockUseDraftClientNote = useDraftClientNote as jest.Mock;
const mockUseSendClientNote = useSendClientNote as jest.Mock;

const ROW: FulfillmentQueueRow = {
  order_id: 'order-1',
  order_no: 1,
  client_name: 'Priya Anand',
  intake_at: '2026-07-01T00:00:00Z',
  designer_attribution: null,
  min_stage_idx: 3,
  has_unmapped: false,
  unmapped_count: 0,
  vendor_count: 2,
  open_exceptions: 0,
  derived_status: 'transmitted',
  stage_entered_at: '2026-07-02T00:00:00Z',
  po_count: 2,
  po_stages: [],
  breached: false,
  stage_age_business_hours: 4,
  next_action_kind: 'awaiting_ack',
  next_action_params: null,
  band: 'watching',
};

const PENDING_DRAFT = {
  id: 'note-1',
  orderId: 'order-1',
  transition: 'confirmed',
  channel: 'email' as const,
  templateKey: 'client_note.confirmed.v1',
  draftedBody: 'Your order #1 is confirmed.',
  sentBody: null,
  editDiff: null,
  sentAt: null,
  resendMessageId: null,
  skippedReason: null,
  createdAt: '2026-07-02T00:00:00Z',
};

describe('NoteDrawer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseDraftClientNote.mockReturnValue({ mutate: mockDraftMutate, isPending: false });
    mockUseSendClientNote.mockReturnValue({ mutate: mockSendMutate, isPending: false });
  });

  it('loads an existing pending draft into the textarea (no new draft() call)', () => {
    mockUseOrderNotifications.mockReturnValue({ data: [PENDING_DRAFT], isLoading: false });
    render(<NoteDrawer row={ROW} open onOpenChange={jest.fn()} />);

    expect(screen.getByTestId('note-drawer-body')).toHaveValue('Your order #1 is confirmed.');
    expect(mockDraftMutate).not.toHaveBeenCalled();
  });

  it('unedited fast path: pressing Enter in the textarea sends with NO editedBody', () => {
    mockUseOrderNotifications.mockReturnValue({ data: [PENDING_DRAFT], isLoading: false });
    render(<NoteDrawer row={ROW} open onOpenChange={jest.fn()} />);

    const textarea = screen.getByTestId('note-drawer-body');
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(mockSendMutate).toHaveBeenCalledTimes(1);
    expect(mockSendMutate.mock.calls[0][0]).toEqual({ notificationId: 'note-1', editedBody: undefined });
  });

  it('unedited fast path: the send button is also unlabeled "Send" (not "Send edited note")', () => {
    mockUseOrderNotifications.mockReturnValue({ data: [PENDING_DRAFT], isLoading: false });
    render(<NoteDrawer row={ROW} open onOpenChange={jest.fn()} />);
    expect(screen.getByTestId('note-drawer-send')).toHaveTextContent('Send');
    expect(screen.getByTestId('note-drawer-send')).not.toHaveTextContent('edited');
  });

  it('lag case: a pending edit not yet flushed to React state still demotes a bare Enter (Wave-E fix)', () => {
    // Reproduces the live bug: onTextareaKeyDown used to compute send mode
    // from the `body` React-state closure, which reflects only keystrokes
    // already flushed to a completed render — up to one keystroke stale
    // relative to the live DOM. Simulate that lag directly: write to the
    // textarea's native value setter (bypassing React's onChange, so `body`
    // state stays at the original drafted text) to represent an edit that
    // landed in the DOM but hasn't reached React state yet, then fire the
    // very next keydown as a bare Enter — the first keystroke the component
    // actually observes. The pre-fix code read the stale (still-unedited)
    // `mode` and fired the fast-send path, silently shipping the stale
    // server draft and discarding the pending edit. The fix must read
    // e.currentTarget.value live, see the divergence, and NOT send.
    mockUseOrderNotifications.mockReturnValue({ data: [PENDING_DRAFT], isLoading: false });
    render(<NoteDrawer row={ROW} open onOpenChange={jest.fn()} />);

    const textarea = screen.getByTestId('note-drawer-body') as HTMLTextAreaElement;
    const nativeValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value',
    )!.set!;
    // Desync the DOM value from React's `body` state — `body` still equals
    // draftedBody ("Your order #1 is confirmed."); the DOM now has a pending,
    // unflushed edit.
    nativeValueSetter.call(textarea, 'Your order #1 is confirmed, actually.');

    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(mockSendMutate).not.toHaveBeenCalled();
  });

  it('edited demotion: after changing the text, a bare Enter does NOT send', () => {
    mockUseOrderNotifications.mockReturnValue({ data: [PENDING_DRAFT], isLoading: false });
    render(<NoteDrawer row={ROW} open onOpenChange={jest.fn()} />);

    const textarea = screen.getByTestId('note-drawer-body');
    fireEvent.change(textarea, { target: { value: 'Your order #1 is confirmed — hand-edited note.' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(mockSendMutate).not.toHaveBeenCalled();
    expect(screen.getByTestId('note-drawer-send')).toHaveTextContent('Send edited note');
  });

  it('edited demotion: Cmd+Enter DOES send, carrying the edited body', () => {
    mockUseOrderNotifications.mockReturnValue({ data: [PENDING_DRAFT], isLoading: false });
    render(<NoteDrawer row={ROW} open onOpenChange={jest.fn()} />);

    const textarea = screen.getByTestId('note-drawer-body');
    fireEvent.change(textarea, { target: { value: 'A hand-edited note to Priya.' } });
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });

    expect(mockSendMutate).toHaveBeenCalledTimes(1);
    expect(mockSendMutate.mock.calls[0][0]).toEqual({
      notificationId: 'note-1',
      editedBody: 'A hand-edited note to Priya.',
    });
  });

  it('edited demotion: the button click also sends the edited body', () => {
    mockUseOrderNotifications.mockReturnValue({ data: [PENDING_DRAFT], isLoading: false });
    render(<NoteDrawer row={ROW} open onOpenChange={jest.fn()} />);

    fireEvent.change(screen.getByTestId('note-drawer-body'), {
      target: { value: 'A hand-edited note to Priya.' },
    });
    fireEvent.click(screen.getByTestId('note-drawer-send'));

    expect(mockSendMutate).toHaveBeenCalledTimes(1);
    expect(mockSendMutate.mock.calls[0][0].editedBody).toBe('A hand-edited note to Priya.');
  });

  it('no pending draft: drafts a fresh note for the derived transition', () => {
    mockUseOrderNotifications.mockReturnValue({ data: [], isLoading: false });
    render(<NoteDrawer row={ROW} open onOpenChange={jest.fn()} />);

    expect(mockDraftMutate).toHaveBeenCalledTimes(1);
    expect(mockDraftMutate.mock.calls[0][0]).toEqual({ orderId: 'order-1', transition: 'confirmed' });
  });

  it('an open exception overrides the transition to eta_change, even mid-shipment', () => {
    mockUseOrderNotifications.mockReturnValue({ data: [], isLoading: false });
    render(<NoteDrawer row={{ ...ROW, derived_status: 'shipped', open_exceptions: 1 }} open onOpenChange={jest.fn()} />);

    expect(mockDraftMutate).toHaveBeenCalledTimes(1);
    expect(mockDraftMutate.mock.calls[0][0]).toEqual({ orderId: 'order-1', transition: 'eta_change' });
  });

  it('renders nothing actionable when closed (no row selected)', () => {
    mockUseOrderNotifications.mockReturnValue({ data: undefined, isLoading: false });
    render(<NoteDrawer row={null} open={false} onOpenChange={jest.fn()} />);
    expect(mockDraftMutate).not.toHaveBeenCalled();
  });
});
