import { fireEvent, render, screen } from '@testing-library/react';
import { MobileAccountHeader } from './mobile-account-header';
import { AccountNameplate } from './account-nameplate';

const onOpen = jest.fn();

jest.mock('@patina/supabase', () => ({
  useAvailability: () => ({ data: 'online' }),
  useProfile: () => ({ data: { display_name: 'Leah Hartwell' } }),
  useOrganizations: () => ({
    data: [{ id: 'studio-1', name: 'Hartwell Studio' }],
  }),
}));

jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    user: { name: 'Leah Hartwell', email: 'leah@patina.dev' },
  }),
}));

jest.mock('@/hooks/use-hydrated', () => ({
  useHydrated: () => true,
}));

jest.mock('./account-sheet', () => ({ openAccount: jest.fn() }));

describe('AccountNameplate (the desktop dock account)', () => {
  it('SQ-877 N11 — is a 44px target', () => {
    render(<AccountNameplate />);
    expect(
      screen.getByRole('button', { name: 'Account and settings' }),
    ).toHaveClass('min-h-11');
  });
});

describe('MobileAccountHeader', () => {
  it('keeps its focus indicator legible on the paper Ledgers sheet', () => {
    render(<MobileAccountHeader onOpen={onOpen} />);

    const account = screen.getByRole('button', {
      name: 'Account and settings',
    });
    expect(account).toHaveClass(
      'focus-visible:outline-2',
      'focus-visible:outline-[var(--clay-ink)]',
    );

    fireEvent.click(account);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
