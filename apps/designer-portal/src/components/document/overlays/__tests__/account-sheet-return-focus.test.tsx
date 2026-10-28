import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRef, useState } from 'react';
import { AccountSheet, openAccountPage } from '../../account/account-sheet';

jest.mock('@patina/supabase', () => ({
  AVAILABILITY_STATUSES: ['online', 'away', 'busy', 'offline'],
  useAvailability: () => ({ data: 'online' }),
  useSetAvailability: () => ({ mutate: jest.fn(), error: null }),
  useAvailabilityRealtime: () => undefined,
  useProfile: () => ({ data: { display_name: 'Leah Hartwell' } }),
  useOrganizations: () => ({ data: [] }),
}));
jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { email: 'leah@example.com' }, signOut: jest.fn() }),
}));
jest.mock('@/hooks/use-hydrated', () => ({ useHydrated: () => true }));
jest.mock('@/hooks/use-viewer-studio', () => ({
  useAccountStudio: () => ({ studio: null }),
}));
jest.mock('@/hooks/use-feature-flag', () => ({
  ...jest.requireActual('@/hooks/use-feature-flag'),
  useFeatureFlag: () => ({ value: true, isLoading: false }),
}));
jest.mock('@/lib/analytics/events', () => ({ authEvents: { logout: jest.fn() } }));
jest.mock('../../account/account-profile-page', () => ({ AccountProfilePage: () => null }));
jest.mock('../../account/account-notifications-page', () => ({ AccountNotificationsPage: () => null }));
jest.mock('../../account/account-security-page', () => ({ AccountSecurityPage: () => null }));
jest.mock('../../account/account-devices-page', () => ({ AccountDevicesPage: () => null }));
jest.mock('../../account/account-extension-page', () => ({ AccountExtensionPage: () => null }));
jest.mock('../../account/account-studio-page', () => ({ AccountStudioPage: () => <input aria-label="Hourly rate" /> }));

function AccountStack() {
  const [showOpener, setShowOpener] = useState(true);
  const fallbackFocusRef = useRef<HTMLElement>(null);
  return (
    <>
      <p ref={fallbackFocusRef} role="status" tabIndex={-1}>Hours priced</p>
      {showOpener && (
        <button
          type="button"
          onClick={(event) => {
            event.currentTarget.focus();
            openAccountPage('studio', { rateFor: 'maria', aboveFolio: true, fallbackFocusRef });
            setShowOpener(false);
          }}
        >Set Maria’s rate</button>
      )}
      <AccountSheet />
    </>
  );
}

describe('Account sheet return focus fallback', () => {
  it('returns focus to the status line when its opener unmounts', async () => {
    render(<AccountStack />);
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Set Maria’s rate' })));
    expect(screen.getByRole('dialog', { name: 'Account settings' })).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await waitFor(() => expect(screen.getByRole('status')).toHaveFocus());
    expect(screen.getByRole('status')).toHaveAttribute('tabindex', '-1');
  });
});
