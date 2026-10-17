import { fireEvent, render, screen } from '@testing-library/react';
import { AccountProfilePage } from '../account-profile-page';

// US-37 #6 — the lead's phone is hers to set; the client presentation reads it
// (00812) and falls back to the studio's phone when it is blank.

const mutate = jest.fn();
let profile: Record<string, unknown> = {};

jest.mock('@patina/supabase', () => ({
  __esModule: true,
  useProfile: () => ({ data: profile }),
  useUpdateProfile: () => ({ mutate, isPending: false, error: null }),
  useUploadAvatar: () => ({ mutate: jest.fn(), isPending: false, error: null }),
  useUpdatePassword: () => ({ mutate: jest.fn(), isPending: false, error: null }),
  useTimeAutostartPreference: () => ({ optedOut: false, isSettled: true }),
  useSetTimeAutostartOptOut: () => ({ mutate: jest.fn(), isPending: false }),
}));

jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { name: 'Leah Hart', email: 'leah@hart.test' } }),
}));

jest.mock('@/hooks/document-time-provider', () => ({ AUTOSTART_ENABLED: false }));

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { time: { autostartOptedOut: jest.fn() } },
}));

jest.mock('../../document-action', () => ({
  DocumentAction: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
  DocumentActionGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/components/feedback/act-fail-line', () => ({ ActFailLine: () => null }));
jest.mock('../../strata-mark', () => ({ StrataMark: () => null }));

describe('AccountProfilePage · phone (US-37 #6)', () => {
  beforeEach(() => {
    mutate.mockReset();
  });

  it('loads the saved phone and saves an edit with the profile', () => {
    profile = { full_name: 'Leah Hart', bio: '', phone: '+1 555 0101' };
    render(<AccountProfilePage />);

    const field = screen.getByLabelText('Phone');
    expect(field).toHaveValue('+1 555 0101');
    expect(field).toHaveAttribute('type', 'tel');

    fireEvent.change(field, { target: { value: '+1 555 0199' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));

    expect(mutate).toHaveBeenCalledWith({ full_name: 'Leah Hart', bio: '', phone: '+1 555 0199' });
  });

  it('shows full_name ahead of stale display_name and retains it on refetch', () => {
    profile = { display_name: 'Leah', full_name: 'Leah Hart', bio: '' };
    const { rerender } = render(<AccountProfilePage />);
    const name = screen.getByLabelText('Display name');
    expect(name).toHaveValue('Leah Hart');

    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    expect(mutate).toHaveBeenCalledWith({ full_name: 'Leah Hart', bio: '', phone: null });

    // The server refetch still contains the old display_name; full_name is the
    // authoritative presentation name and remains what the field shows.
    profile = { display_name: 'Leah', full_name: 'Leah Hart', bio: '' };
    rerender(<AccountProfilePage />);
    expect(screen.getByLabelText('Display name')).toHaveValue('Leah Hart');
  });

  it('stores a blank phone as null so the studio phone answers instead', () => {
    profile = { full_name: 'Leah Hart', bio: '', phone: '+1 555 0101' };
    render(<AccountProfilePage />);

    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));

    expect(mutate).toHaveBeenCalledWith({ full_name: 'Leah Hart', bio: '', phone: null });
  });

  it('the phone help never promises clients her sign-in email (R178)', () => {
    profile = { full_name: 'Leah Hart', bio: '', phone: '' };
    render(<AccountProfilePage />);

    const help = screen.getByText(/Shown to clients with your name/);
    expect(help).toHaveTextContent(
      "Shown to clients with your name on the papers they approve. Leave it blank and they see the studio's phone.",
    );
    expect(help).not.toHaveTextContent(/email/i);
  });
});
