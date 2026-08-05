import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import MfaEnrollPage from './page';
import { hardNavigate } from '@/lib/auth-navigation';

const listFactors = jest.fn();
const getSession = jest.fn();
const getAuthenticatorAssuranceLevel = jest.fn();
const enrollMutate = jest.fn();
const challengeExisting = jest.fn();
const verifyEnrollment = jest.fn();

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('callbackUrl=%2Forders'),
}));

jest.mock('@patina/supabase', () => ({
  createBrowserClient: () => ({
    auth: {
      getSession,
      mfa: { listFactors, getAuthenticatorAssuranceLevel },
    },
  }),
  normalizeAuthError: jest.requireActual('@patina/supabase/auth')
    .normalizeAuthError,
  useEnrollMfa: () => ({ mutate: enrollMutate, isPending: false }),
  useChallengeMfa: () => ({
    mutateAsync: challengeExisting,
    isPending: false,
  }),
  useVerifyMfaEnrollment: () => ({
    mutateAsync: verifyEnrollment,
    isPending: false,
  }),
}));

jest.mock('@/lib/auth-navigation', () => {
  const actual = jest.requireActual('@/lib/auth-navigation');
  return { ...actual, hardNavigate: jest.fn() };
});

describe('Admin MFA gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getSession.mockResolvedValue({
      data: { session: { access_token: 'admin-session' } },
      error: null,
    });
    getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: 'aal2' },
      error: null,
    });
    challengeExisting.mockResolvedValue({});
    verifyEnrollment.mockResolvedValue({});
  });

  it('reuses one factor lookup in Strict Mode and challenges an existing authenticator', async () => {
    listFactors.mockResolvedValue({
      data: {
        totp: [
          {
            id: 'verified-factor',
            status: 'verified',
            friendly_name: 'Work phone',
          },
        ],
      },
      error: null,
    });

    render(
      <StrictMode>
        <MfaEnrollPage />
      </StrictMode>,
    );
    expect(await screen.findByText('Confirm it’s you.')).toBeVisible();
    expect(listFactors).toHaveBeenCalledTimes(1);
    expect(enrollMutate).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Six-digit code'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Verify and continue' }));

    expect(await screen.findByText('Authenticator confirmed.')).toBeVisible();
    expect(challengeExisting).toHaveBeenCalledWith({
      factorId: 'verified-factor',
      code: '123456',
    });
    expect(verifyEnrollment).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('link', { name: 'Continue to Patina Operations' }),
    );
    expect(hardNavigate).toHaveBeenCalledWith('/orders');
  });

  it('only enrolls when the account has no verified factor', async () => {
    listFactors.mockResolvedValue({ data: { totp: [] }, error: null });
    enrollMutate.mockImplementation(
      (_input: unknown, callbacks: { onSuccess(data: unknown): void }) => {
        callbacks.onSuccess({
          factorId: 'new-factor',
          qrCode: 'data:image/svg+xml;base64,PHN2Zy8+',
          secret: 'setup-secret',
        });
      },
    );

    render(<MfaEnrollPage />);
    expect(await screen.findByText('Add an authenticator.')).toBeVisible();
    expect(enrollMutate).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByAltText('Authenticator enrollment QR code'),
    ).toBeVisible();
    expect(challengeExisting).not.toHaveBeenCalled();
  });

  it('does not show success unless the resulting session reaches AAL2', async () => {
    listFactors.mockResolvedValue({
      data: {
        totp: [
          { id: 'verified-factor', status: 'verified', friendly_name: null },
        ],
      },
      error: null,
    });
    getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: 'aal1' },
      error: null,
    });
    render(<MfaEnrollPage />);
    await screen.findByText('Confirm it’s you.');
    fireEvent.change(screen.getByLabelText('Six-digit code'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Verify and continue' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeVisible());
    expect(screen.queryByText('Authenticator confirmed.')).not.toBeInTheDocument();
    expect(hardNavigate).not.toHaveBeenCalled();
  });
});
