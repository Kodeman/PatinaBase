/**
 * US-28 S6 — /preferences in the house: the Header line, Sections of rows,
 * and the house check. No white rounded cards, no native blue checkboxes.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import PreferencesPage from './page';

const mockMutate = jest.fn();
let mockAuthenticated = true;

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ isAuthenticated: mockAuthenticated, isLoading: false }),
}));

jest.mock('@patina/supabase', () => ({
  useNotificationPreferences: () => ({
    data: {
      channels_email: true,
      type_new_lead: true,
      type_lead_expiring: false,
      type_lead_response: true,
      type_client_message: true,
      type_project_milestone: true,
      type_commission_earned: true,
      type_new_products: false,
      type_weekly_inspiration: false,
      type_founding_circle: false,
      type_product_launch: false,
      type_seasonal_campaign: false,
      type_reengagement: false,
      type_account_security: true,
      type_order_confirmation: true,
      type_payment_receipt: true,
      quiet_hours_enabled: false,
      quiet_hours_start: null,
      quiet_hours_end: null,
      timezone: 'UTC',
      digest_frequency: 'weekly',
    },
    isLoading: false,
    error: null,
  }),
  useUpdateNotificationPreferences: () => ({ mutate: mockMutate, isPending: false, error: null }),
}));

beforeEach(() => {
  mockAuthenticated = true;
  mockMutate.mockClear();
});

describe('/preferences (US-28 S6)', () => {
  it('opens on the Header line: back to the Desk, the title, the double rule', () => {
    const { container } = render(<PreferencesPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Preferences' })).toHaveClass('t-d2');
    expect(screen.getByRole('link', { name: /Desk/ })).toHaveAttribute('href', '/desk');
    expect(container.querySelector('header.hline + .rule-strong')).not.toBeNull();
  });

  it('lays each group out as a Section of rows, never a white rounded card', () => {
    const { container } = render(<PreferencesPage />);
    for (const name of ['Email', 'Designer activity', 'Marketing', 'Account', 'Quiet hours']) {
      expect(screen.getByRole('region', { name })).toHaveClass('section');
    }
    expect(container.querySelector('.rounded-lg, .bg-white, .rounded-md, .rounded-full')).toBeNull();
  });

  it('draws every check as the house check, never the native blue box', () => {
    render(<PreferencesPage />);
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes.length).toBeGreaterThan(0);
    for (const box of boxes) {
      expect(box).toHaveClass('check-input');
      expect(box.className).not.toMatch(/text-\[var\(--color-taupe\)\]|focus:ring/);
      expect(box.nextElementSibling).toHaveClass('check-box');
    }
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).toHaveClass('check-input');
      expect(radio.nextElementSibling).toHaveClass('check-box');
    }
  });

  it('writes a row through on change', () => {
    render(<PreferencesPage />);
    const row = screen.getByRole('checkbox', { name: /Lead expiring soon/ });
    fireEvent.click(row);
    expect(mockMutate).toHaveBeenCalledWith({ type_lead_expiring: true }, expect.anything());
  });

  it('holds an always-on row checked and refuses the click', () => {
    render(<PreferencesPage />);
    const account = screen.getByRole('region', { name: 'Account' });
    const security = within(account).getByRole('checkbox', { name: /Account & security/ });
    expect(security).toBeChecked();
    expect(security).toBeDisabled();
  });

  it('signed out: no back act to a Desk the visitor cannot reach, and a secondary Sign in', () => {
    mockAuthenticated = false;
    render(<PreferencesPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Preferences' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Desk/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Sign in/ })).toHaveAttribute(
      'href',
      '/auth/signin?callbackUrl=/preferences',
    );
  });
});
