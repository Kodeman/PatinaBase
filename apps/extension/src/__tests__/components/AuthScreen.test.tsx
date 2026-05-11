/**
 * AuthScreen component — portal sign-in button behaviour.
 *
 * Confirms that clicking "Use email code on patina.cloud" calls
 * chrome.tabs.create with the expected URL containing ?source=ext.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock the lib/supabase module so the component gets a stable PORTAL_URL
// and we avoid real Supabase client initialisation.
vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  },
  PORTAL_URL: 'https://app.patina.cloud',
}));

// Mock useQRAuth so the component renders the QR / pending state
// (which shows the divider + both alternative sign-in buttons).
vi.mock('../../hooks/use-qr-auth', () => ({
  useQRAuth: () => ({
    state: 'pending',
    qrUrl: 'https://example.com/qr',
    secondsRemaining: 120,
    regenerate: vi.fn(),
    error: null,
  }),
}));

// Mock child components that pull in heavy dependencies
vi.mock('../../components/LoadingStrata', () => ({
  LoadingStrata: () => null,
}));
vi.mock('../../components/StrataMark', () => ({
  StrataMark: () => null,
}));

import { AuthScreen } from '../../components/AuthScreen';

describe('AuthScreen — portal sign-in button', () => {
  let tabsCreateMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tabsCreateMock = vi.fn();
    // Inject chrome.tabs.create into the global chrome stub from setup.ts
    (globalThis as unknown as { chrome: { tabs: { create: ReturnType<typeof vi.fn> } } })
      .chrome.tabs.create = tabsCreateMock;
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the "Use email code on patina.cloud" button', () => {
    render(<AuthScreen />);
    expect(
      screen.getByTestId('auth.openPortalSignin')
    ).toBeTruthy();
  });

  it('calls chrome.tabs.create with the correct URL when clicked', async () => {
    render(<AuthScreen />);
    const button = screen.getByTestId('auth.openPortalSignin');
    await userEvent.click(button);
    expect(tabsCreateMock).toHaveBeenCalledOnce();
    expect(tabsCreateMock).toHaveBeenCalledWith({
      url: 'https://app.patina.cloud/auth/signin?source=ext',
    });
  });

  it('does not modify the QR code section', () => {
    render(<AuthScreen />);
    // QR SVG is rendered (qrcode.react emits an <svg>)
    expect(document.querySelector('svg')).toBeTruthy();
  });

  it('does not modify the "Sign in with email" button', () => {
    render(<AuthScreen />);
    expect(screen.getByText('Sign in with email')).toBeTruthy();
  });
});
