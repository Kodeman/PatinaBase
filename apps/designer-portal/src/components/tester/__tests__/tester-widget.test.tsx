import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TesterWidget } from '../tester-widget';

let mockFlag = { value: true, isLoading: false };
let mockUser: { id: string } | undefined = { id: 'me' };
let mockUnseen: Array<{ id: string }> = [];
const mockMutateAsync = jest.fn().mockResolvedValue({ id: 'note-1' });

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

describe('TesterWidget', () => {
  beforeEach(() => {
    mockFlag = { value: true, isLoading: false };
    mockUser = { id: 'me' };
    mockUnseen = [];
    mockMutateAsync.mockClear();
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

  it('opens the capture form on the New note tab', () => {
    render(<TesterWidget />);
    fireEvent.click(pill()!);
    expect(screen.getByRole('radiogroup', { name: 'Bucket' })).toBeInTheDocument();
  });

  it('turns the bug switch on when the bucket is Not working', () => {
    render(<TesterWidget />);
    fireEvent.click(pill()!);

    const bug = screen.getByRole('switch', {
      name: /File as a bug/i,
    }) as HTMLInputElement;
    expect(bug.checked).toBe(false);

    fireEvent.click(screen.getByRole('radio', { name: 'Not working' }));
    expect(bug.checked).toBe(true);
  });

  it('submits a bug with report_kind and the user agent', async () => {
    render(<TesterWidget />);
    fireEvent.click(pill()!);
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
    fireEvent.click(pill()!);
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

  it('opens on ⌘⇧F', () => {
    render(<TesterWidget />);
    fireEvent.keyDown(window, { key: 'F', metaKey: true, shiftKey: true });
    expect(screen.getByRole('radiogroup', { name: 'Bucket' })).toBeInTheDocument();
  });

  it('shows Past notes on its tab and routes its empty action back to New note', () => {
    render(<TesterWidget />);
    fireEvent.click(pill()!);
    fireEvent.click(screen.getByRole('tab', { name: 'Past notes' }));

    const ledger = screen.getByRole('button', { name: 'Feedback ledger' });
    expect(ledger).toBeInTheDocument();

    fireEvent.click(ledger);
    expect(screen.getByRole('radiogroup', { name: 'Bucket' })).toBeInTheDocument();
  });

  it('carries a dot when shipped notes are unseen', () => {
    mockUnseen = [{ id: 'f1' }];
    render(<TesterWidget />);
    expect(screen.getByLabelText('shipped notes to see')).toBeInTheDocument();
  });
});
