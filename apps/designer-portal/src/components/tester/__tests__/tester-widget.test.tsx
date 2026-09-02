import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TesterWidget } from '../tester-widget';

let mockFlag = { value: true, isLoading: false };
let mockUser: { id: string } | undefined = { id: 'me' };
let mockUnseen: Array<{ id: string }> = [];
const mockMutateAsync = jest.fn().mockResolvedValue({ id: 'note-1' });
// The screenshot the opener captures — every doorway runs through
// openFeedbackSheet(), so a blob must reach the form on a plain pill click.
let mockShot: Blob | null = new Blob(['png'], { type: 'image/png' });
const mockCapture = jest.fn(() => Promise.resolve(mockShot));

jest.mock('@/lib/document/feedback', () => ({
  ...jest.requireActual('@/lib/document/feedback'),
  captureScreenshot: () => mockCapture(),
}));

jest.mock('@/hooks/use-hydrated', () => ({ useHydrated: () => true }));

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (name: string) =>
    name === 'tester-notes' ? mockFlag : { value: false, isLoading: false },
}));

jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: mockUser }),
}));

jest.mock('@patina/supabase', () => ({
  useUnseenShipped: () => ({ data: mockUnseen }),
  useCreateFeedback: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));

jest.mock('next/navigation', () => ({
  usePathname: () => '/desk',
}));

// The Past-notes tab reuses the Patina ledger; its own behaviour is not what
// this suite is about.
jest.mock('@/components/document/feedback/feedback-ledger', () => ({
  FeedbackLedger: ({ onNew }: { onNew?: () => void }) => (
    <button type="button" onClick={onNew}>
      Feedback ledger
    </button>
  ),
}));

function pill() {
  return screen.queryByRole('button', { name: /TESTER/i });
}

/**
 * The panel is a `region`, not a `dialog` — five product surfaces stand down
 * from their own keys while any `[role="dialog"]` is in the DOM, and this
 * instrument must not silence the product it measures. Probing by that role
 * pins it.
 */
function panel() {
  return screen.queryByRole('region', { name: 'Tester notes' });
}

/**
 * Every doorway runs the screenshot capture, which lands a beat after the open;
 * act() lets that settle so no test asserts against a half-opened panel.
 */
async function openPanel(act_: () => void) {
  await act(async () => {
    act_();
  });
}

describe('TesterWidget', () => {
  beforeAll(() => {
    // jsdom has no object URLs; the form previews the shot with one.
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = () => 'blob:shot';
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = () => undefined;
  });

  beforeEach(() => {
    mockFlag = { value: true, isLoading: false };
    mockUser = { id: 'me' };
    mockUnseen = [];
    mockShot = new Blob(['png'], { type: 'image/png' });
    mockMutateAsync.mockClear();
    mockCapture.mockClear();
  });

  it('renders nothing while the flag is loading', () => {
    mockFlag = { value: false, isLoading: true };
    render(<TesterWidget />);
    expect(pill()).not.toBeInTheDocument();
  });

  it('renders nothing when the flag is off', () => {
    mockFlag = { value: false, isLoading: false };
    render(<TesterWidget />);
    expect(pill()).not.toBeInTheDocument();
  });

  it('renders nothing when nobody is signed in', () => {
    mockUser = undefined;
    render(<TesterWidget />);
    expect(pill()).not.toBeInTheDocument();
  });

  it('prints the TESTER pill for a signed-in tester with the flag on', () => {
    render(<TesterWidget />);
    expect(pill()).toBeInTheDocument();
  });

  it('opens the capture form on the New note tab', async () => {
    render(<TesterWidget />);
    await openPanel(() => fireEvent.click(pill()!));
    expect(screen.getByRole('radiogroup', { name: 'Bucket' })).toBeInTheDocument();
  });

  it('turns the bug switch on when the bucket is Not working', async () => {
    render(<TesterWidget />);
    await openPanel(() => fireEvent.click(pill()!));

    const bug = screen.getByRole('switch', {
      name: /File as a bug/i,
    }) as HTMLInputElement;
    expect(bug.checked).toBe(false);

    fireEvent.click(screen.getByRole('radio', { name: 'Not working' }));
    expect(bug.checked).toBe(true);
  });

  it('submits a bug with report_kind and the user agent', async () => {
    render(<TesterWidget />);
    await openPanel(() => fireEvent.click(pill()!));
    fireEvent.click(screen.getByRole('radio', { name: 'Not working' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Note' }), {
      target: { value: 'Totals go blank' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Send bug report/i }));

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
    const input = mockMutateAsync.mock.calls[0][0];
    expect(input.report_kind).toBe('bug');
    expect(input.bucket).toBe('not_working');
    expect(input.note).toBe('Totals go blank');
    expect(typeof input.user_agent).toBe('string');
    expect(input.user_agent.length).toBeGreaterThan(0);
  });

  it('submits a plain note as report_kind note', async () => {
    render(<TesterWidget />);
    await openPanel(() => fireEvent.click(pill()!));
    fireEvent.click(screen.getByRole('radio', { name: 'Missing' }));
    fireEvent.click(screen.getByRole('button', { name: /Leave note/i }));

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
    expect(mockMutateAsync.mock.calls[0][0].report_kind).toBe('note');
  });

  it('opens on document:open-feedback — the ⌘K doorway still works', () => {
    render(<TesterWidget />);
    fireEvent(window, new CustomEvent('document:open-feedback', { detail: {} }));
    expect(screen.getByRole('radiogroup', { name: 'Bucket' })).toBeInTheDocument();
  });

  it('opens on ⌘⇧F', async () => {
    render(<TesterWidget />);
    await openPanel(() =>
      fireEvent.keyDown(window, { key: 'F', metaKey: true, shiftKey: true }),
    );
    expect(screen.getByRole('radiogroup', { name: 'Bucket' })).toBeInTheDocument();
  });

  it('shows Past notes on its tab and routes its empty action back to New note', async () => {
    render(<TesterWidget />);
    await openPanel(() => fireEvent.click(pill()!));
    fireEvent.click(screen.getByRole('tab', { name: 'Past notes' }));

    const ledger = screen.getByRole('button', { name: 'Feedback ledger' });
    expect(ledger).toBeInTheDocument();

    fireEvent.click(ledger);
    expect(screen.getByRole('radiogroup', { name: 'Bucket' })).toBeInTheDocument();
  });

  it('leaves ⌘⇧F to the product when the flag is off', () => {
    mockFlag = { value: false, isLoading: false };
    render(<TesterWidget />);

    // The absent panel proves little — nothing renders with the flag off at
    // all. What matters is that the key was not swallowed: an unflagged portal
    // must be free to bind ⌘⇧F itself, and the widget's handler calls
    // preventDefault() on every ⌘⇧F it claims.
    const event = new KeyboardEvent('keydown', {
      key: 'F',
      metaKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(mockCapture).not.toHaveBeenCalled();
    expect(panel()).not.toBeInTheDocument();
  });

  it('is inert on document:open-feedback when the flag is off', () => {
    mockFlag = { value: false, isLoading: false };
    render(<TesterWidget />);
    fireEvent(
      window,
      new CustomEvent('document:open-feedback', { detail: { bucket: 'working' } }),
    );

    expect(panel()).not.toBeInTheDocument();
    expect(
      screen.queryByRole('radiogroup', { name: 'Bucket' }),
    ).not.toBeInTheDocument();
  });

  it('keeps a typed note when ⌘⇧F fires on the open panel', async () => {
    render(<TesterWidget />);
    await openPanel(() => fireEvent.click(pill()!));
    fireEvent.change(screen.getByRole('textbox', { name: 'Note' }), {
      target: { value: 'Mid-sentence' },
    });

    // A second doorway on an open panel must not remount the form: she is
    // typing into it.
    await openPanel(() =>
      fireEvent.keyDown(window, { key: 'F', metaKey: true, shiftKey: true }),
    );

    expect(screen.getByRole('textbox', { name: 'Note' })).toHaveValue(
      'Mid-sentence',
    );
  });

  it('leaves Escape to a modal dialog stacked over the panel', async () => {
    render(<TesterWidget />);
    await openPanel(() => fireEvent.click(pill()!));
    expect(panel()).toBeInTheDocument();

    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    document.body.appendChild(dialog);
    try {
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(panel()).toBeInTheDocument();
    } finally {
      dialog.remove();
    }

    // With the dialog gone the key is the panel's again.
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(panel()).not.toBeInTheDocument();
  });

  it('carries the captured screenshot when the pill is the doorway', async () => {
    render(<TesterWidget />);
    await openPanel(() => fireEvent.click(pill()!));
    expect(mockCapture).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('radio', { name: 'Missing' }));
    fireEvent.click(screen.getByRole('button', { name: /Leave note/i }));

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
    expect(mockMutateAsync.mock.calls[0][0].screenshot).toBeInstanceOf(Blob);
  });

  it('keeps a half-written note through a trip to Past notes', async () => {
    render(<TesterWidget />);
    await openPanel(() => fireEvent.click(pill()!));
    fireEvent.change(screen.getByRole('textbox', { name: 'Note' }), {
      target: { value: 'Half a thought' },
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Past notes' }));
    fireEvent.click(screen.getByRole('tab', { name: 'New note' }));

    expect(screen.getByRole('textbox', { name: 'Note' })).toHaveValue(
      'Half a thought',
    );
  });

  it('pre-selects the bucket a doorway asked for', () => {
    render(<TesterWidget />);
    fireEvent(
      window,
      new CustomEvent('document:open-feedback', { detail: { bucket: 'working' } }),
    );

    expect(screen.getByRole('radio', { name: 'Working' })).toBeChecked();
  });

  it('carries a dot when shipped notes are unseen', () => {
    mockUnseen = [{ id: 'f1' }];
    render(<TesterWidget />);
    expect(screen.getByLabelText('shipped notes to see')).toBeInTheDocument();
  });
});
