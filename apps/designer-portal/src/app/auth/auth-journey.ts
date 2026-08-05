import { safeAuthReturnPath, type PortalQrAuthState } from '@patina/supabase';
import type { PortalLoginState } from '@patina/design-system';
import { DESIGNER_AUTH_DESTINATION } from './auth-shell';

export type DesignerLoginPhase =
  | 'email'
  | 'code'
  | 'password'
  | 'apple-pending'
  | 'success';

/** Product order; the shared component renders this exact sequence. */
export const DESIGNER_SIGNIN_METHODS = [
  'email-otp',
  'qr',
  'apple',
  'password',
] as const;

export interface DesignerSignInNotice {
  tone: 'error' | 'info' | 'success';
  title: string;
  description: string;
}

export function designerSignInNotice(
  error: string | null,
  registered: string | null,
): DesignerSignInNotice | null {
  if (registered === 'true') {
    return {
      tone: 'success',
      title: 'Your account is ready.',
      description: 'Check your email if Patina asks you to confirm the address, then sign in here.',
    };
  }

  switch (error?.toLowerCase()) {
    case 'sessionexpired':
    case 'session_required':
    case 'sessionrequired':
      return {
        tone: 'info',
        title: 'Your session ended.',
        description: 'Sign in again to keep working. Your saved studio work is still here.',
      };
    case 'accessdenied':
    case 'access_denied':
      return {
        tone: 'error',
        title: 'This account can’t open the studio.',
        description: 'Try another account, or contact Patina if you think your access should be restored.',
      };
    case 'oauth':
    case 'oauthsignin':
    case 'oauthcallback':
      return {
        tone: 'error',
        title: 'Apple sign-in didn’t finish.',
        description: 'Try Apple again, or use the one-time code by email.',
      };
    default:
      return error
        ? {
            tone: 'error',
            title: 'Sign-in needs another try.',
            description: 'Use a one-time code by email, or contact Patina if the problem continues.',
          }
        : null;
  }
}

export function designerDestination(raw: string | null | undefined): string {
  return safeAuthReturnPath(raw, DESIGNER_AUTH_DESTINATION);
}

export function callbackDestination({
  callbackUrl,
  next,
  type,
}: {
  callbackUrl?: string | null;
  next?: string | null;
  type?: string | null;
}): string {
  if (type === 'recovery') {
    const recoveryPath = designerDestination(callbackUrl || next);
    return recoveryPath === '/auth/reset-password' ||
      recoveryPath.startsWith('/auth/reset-password?')
      ? recoveryPath
      : '/auth/reset-password';
  }

  return designerDestination(callbackUrl || next);
}

export function confirmedSession(...sessions: Array<unknown>): boolean {
  return sessions.some((session) => Boolean(session && typeof session === 'object'));
}

/** QR transport is opt-in: the hook must never create or poll a code while collapsed. */
export function shouldActivateQr(expanded: boolean): boolean {
  return expanded;
}

export function designerLoginState(
  phase: DesignerLoginPhase,
  qrExpanded: boolean,
  qrState: PortalQrAuthState,
): PortalLoginState {
  if (phase === 'success') return 'success';
  if (phase === 'code') return 'code';
  if (phase === 'password') return 'password';
  if (phase === 'apple-pending') return 'apple-pending';
  if (!qrExpanded) return 'email';
  return qrState === 'expired' || qrState === 'denied'
    ? 'qr-expired'
    : 'qr';
}

export function qrPresentation(
  state: PortalQrAuthState,
  secondsRemaining: number,
  failureMessage?: string,
): { loginState: PortalLoginState; description: string } {
  if (state === 'expired') return { loginState: 'qr-expired', description: 'That code has expired. Refresh it to try again.' };
  if (state === 'denied') return { loginState: 'qr-expired', description: 'This code was declined. Refresh it to try again.' };
  if (state === 'verifying') return { loginState: 'qr', description: 'Your phone approved this code. Confirming your session now.' };
  if (state === 'loading') return { loginState: 'qr', description: 'Preparing a private code for your phone.' };
  if (state === 'error') return { loginState: 'qr', description: failureMessage ?? 'We could not prepare a QR code. Refresh it or use email instead.' };
  if (state === 'pending') return { loginState: 'qr', description: `Scan with the Patina app. Expires in ${secondsRemaining}s.` };
  return { loginState: 'qr', description: 'Use your signed-in phone to scan this code.' };
}
