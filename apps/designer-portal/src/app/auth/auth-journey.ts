import { safeAuthReturnPath, type PortalQrAuthState } from '@patina/supabase';
import type { PortalLoginState } from '@patina/design-system';
import { DESIGNER_AUTH_DESTINATION } from './auth-shell';

/** Product order; the shared component renders this exact sequence. */
export const DESIGNER_SIGNIN_METHODS = [
  'email-otp',
  'qr',
  'apple',
  'password',
] as const;

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
  return designerDestination(
    callbackUrl || next || (type === 'recovery' ? '/auth/reset-password' : null),
  );
}

export function confirmedSession(...sessions: Array<unknown>): boolean {
  return sessions.some((session) => Boolean(session && typeof session === 'object'));
}

/** QR transport is opt-in: the hook must never create or poll a code while collapsed. */
export function shouldActivateQr(expanded: boolean): boolean {
  return expanded;
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
