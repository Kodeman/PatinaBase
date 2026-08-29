/**
 * AuthScreen component — portal sign-in / sign-up button behaviour.
 *
 * Confirms that the primary "Sign in on patina.cloud" and secondary
 * "Create an account" buttons call chrome.tabs.create with the expected
 * URLs containing ?source=ext.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { QRAuthResult } from '../../hooks/use-qr-auth';

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

// Mock useQRAuth so the component renders the QR / pending state by default
// (which shows the divider + both alternative sign-in buttons). Individual
// tests may override the return value (e.g. to assert 'approved' behaviour).
const useQRAuthMock = vi.fn<() => QRAuthResult>(() => ({
  state: 'pending',
  qrUrl: 'https://example.com/qr',
  secondsRemaining: 120,
  regenerate: vi.fn(),
  error: null,
}));
vi.mock('../../hooks/use-qr-auth', () => ({
  useQRAuth: () => useQRAuthMock(),
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
    // Reset useQRAuth back to the default 'pending' state for each test.
    useQRAuthMock.mockReturnValue({
      state: 'pending',
      qrUrl: 'https://example.com/qr',
      secondsRemaining: 120,
      regenerate: vi.fn(),
      error: null,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the "Sign in on patina.cloud" primary button', () => {
    render(<AuthScreen />);
    expect(
      screen.getByTestId('auth.openPortalSignin')
    ).toBeTruthy();
    expect(screen.getByText('Sign in on patina.cloud')).toBeTruthy();
  });

  it('calls chrome.tabs.create with the sign-in URL when the primary button is clicked', async () => {
    render(<AuthScreen />);
    const button = screen.getByTestId('auth.openPortalSignin');
    await userEvent.click(button);
    expect(tabsCreateMock).toHaveBeenCalledOnce();
    expect(tabsCreateMock).toHaveBeenCalledWith({
      url: 'https://app.patina.cloud/auth/signin?source=ext',
    });
  });

  it('renders "Create an account" and calls chrome.tabs.create with the sign-up URL when clicked', async () => {
    render(<AuthScreen />);
    const button = screen.getByTestId('auth.openPortalSignup');
    expect(screen.getByText('Create an account')).toBeTruthy();
    await userEvent.click(button);
    expect(tabsCreateMock).toHaveBeenCalledOnce();
    expect(tabsCreateMock).toHaveBeenCalledWith({
      url: 'https://app.patina.cloud/auth/signup?source=ext',
    });
  });

  it('orders the primary sign-in button before "Create an account" before the QR pairing section', () => {
    render(<AuthScreen />);
    const signIn = screen.getByTestId('auth.openPortalSignin');
    const signUp = screen.getByTestId('auth.openPortalSignup');
    const qrHint = screen.getByText('Scan with the Patina iOS app');
    expect(
      signIn.compareDocumentPosition(signUp) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      signUp.compareDocumentPosition(qrHint) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
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

  it('hides the primary sign-in/sign-up CTAs once QR pairing is approved', () => {
    useQRAuthMock.mockReturnValue({
      state: 'approved',
      qrUrl: 'https://example.com/qr',
      secondsRemaining: 0,
      regenerate: vi.fn(),
      error: null,
    });
    render(<AuthScreen />);
    expect(screen.queryByTestId('auth.openPortalSignin')).toBeNull();
    expect(screen.queryByTestId('auth.openPortalSignup')).toBeNull();
    expect(screen.getByText(/Signed in/)).toBeTruthy();
  });
});
