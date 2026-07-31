import { fireEvent, render, screen } from '@testing-library/react';
import { MobileAccountHeader } from './mobile-account-header';

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

describe('MobileAccountHeader', () => {
  it('keeps its focus indicator legible on the charcoal drawer', () => {
    render(<MobileAccountHeader onOpen={onOpen} />);

    const account = screen.getByRole('button', {
      name: 'Account and settings',
    });
    expect(account).toHaveClass(
      'focus-visible:outline-2',
      'focus-visible:outline-[var(--color-clay)]',
    );

    fireEvent.click(account);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
