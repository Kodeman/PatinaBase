import { render, screen, fireEvent } from '@testing-library/react';

import { AccountMenu } from './account-menu';

const mutate = jest.fn();
const signOut = jest.fn();

jest.mock('@patina/supabase', () => ({
  useAvailability: () => ({ data: 'online' }),
  useSetAvailability: () => ({ mutate }),
  useAvailabilityRealtime: () => undefined,
  AVAILABILITY_STATUSES: ['online', 'away', 'busy', 'offline'],
}));

jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ signOut }),
}));

jest.mock('@/hooks/use-hydrated', () => ({
  useHydrated: () => true,
}));

const user = { name: 'Admin User', email: 'admin@patina.dev' };

const openMenu = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Account menu' }));
};

describe('AccountMenu', () => {
  it('is account-only: Profile + Settings links, no business items', () => {
    render(<AccountMenu user={user} />);
    openMenu();

    expect(screen.getByRole('menuitem', { name: 'Profile' })).toHaveAttribute(
      'href',
      '/portal/profile'
    );
    expect(screen.getByRole('menuitem', { name: 'Settings' })).toHaveAttribute(
      'href',
      '/portal/settings'
    );
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();

    // The misplaced business/duplicate links must be gone.
    expect(screen.queryByText('Earnings')).not.toBeInTheDocument();
    expect(screen.queryByText('Portfolio')).not.toBeInTheDocument();
    expect(screen.queryByText('Help & Resources')).not.toBeInTheDocument();
  });

  it('shows identity (name + email)', () => {
    render(<AccountMenu user={user} />);
    openMenu();

    expect(screen.getByText('Admin User')).toBeInTheDocument();
    expect(screen.getByText('admin@patina.dev')).toBeInTheDocument();
  });

  it('persists a status pick through the availability mutation', () => {
    render(<AccountMenu user={user} />);
    openMenu();

    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(4);
    expect(screen.getByRole('radio', { name: /online/i })).toHaveAttribute(
      'aria-checked',
      'true'
    );

    fireEvent.click(screen.getByRole('radio', { name: /busy/i }));
    expect(mutate).toHaveBeenCalledWith('busy');
  });

  it('signs out via useAuth', () => {
    render(<AccountMenu user={user} />);
    openMenu();

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(signOut).toHaveBeenCalled();
  });
});
