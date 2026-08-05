import {
  callbackDestination,
  confirmedSession,
  DESIGNER_SIGNIN_METHODS,
  designerDestination,
  designerLoginState,
  designerSignInNotice,
  qrPresentation,
  shouldActivateQr,
} from '../auth-journey';

describe('designer auth journey', () => {
  it('keeps the approved method order and email OTP as the default', () => {
    expect(DESIGNER_SIGNIN_METHODS).toEqual(['email-otp', 'qr', 'apple', 'password']);
  });

  it('only allows same-origin destinations through every callback leg', () => {
    expect(designerDestination('/desk?project=oak')).toBe('/desk?project=oak');
    expect(designerDestination('//evil.example')).toBe('/desk');
    expect(designerDestination('/%5cevil.example')).toBe('/desk');
    expect(callbackDestination({ next: '/auth/accept-invite?token=abc' })).toBe('/auth/accept-invite?token=abc');
    expect(callbackDestination({ callbackUrl: 'https://evil.example' })).toBe('/desk');
  });

  it('routes recovery callbacks to the reset form without losing a safe destination', () => {
    expect(callbackDestination({ type: 'recovery' })).toBe('/auth/reset-password');
    expect(callbackDestination({ callbackUrl: '/auth/reset-password?callbackUrl=%2Fdesk%3Fbook%3Dorders', type: 'recovery' }))
      .toBe('/auth/reset-password?callbackUrl=%2Fdesk%3Fbook%3Dorders');
    expect(callbackDestination({ callbackUrl: '/desk?book=orders', type: 'recovery' }))
      .toBe('/auth/reset-password');
    expect(callbackDestination({ callbackUrl: '/auth/reset-passwording', type: 'recovery' }))
      .toBe('/auth/reset-password');
    expect(callbackDestination({ callbackUrl: '//evil.example', type: 'recovery' }))
      .toBe('/auth/reset-password');
  });

  it('requires a real session before a hard redirect can begin', () => {
    expect(confirmedSession(null, undefined)).toBe(false);
    expect(confirmedSession(null, { access_token: 'session' })).toBe(true);
  });

  it('turns legacy query errors into useful, non-provider error copy', () => {
    expect(designerSignInNotice('SessionExpired', null)).toEqual(expect.objectContaining({
      title: 'Your session ended.',
    }));
    expect(designerSignInNotice('AccessDenied', null)?.description).toContain('another account');
    expect(designerSignInNotice('untrusted raw provider message', null)?.description)
      .not.toContain('untrusted raw provider message');
    expect(designerSignInNotice(null, 'true')?.tone).toBe('success');
  });

  it('maps QR states distinctly while leaving generation lazy to the disclosure', () => {
    expect(shouldActivateQr(false)).toBe(false);
    expect(shouldActivateQr(true)).toBe(true);
    expect(qrPresentation('idle', 0)).toEqual(expect.objectContaining({ loginState: 'qr' }));
    expect(qrPresentation('pending', 42).description).toContain('42s');
    expect(qrPresentation('verifying', 0).description).toContain('Confirming');
    expect(qrPresentation('expired', 0).loginState).toBe('qr-expired');
    expect(qrPresentation('denied', 0).description).toContain('declined');
    expect(designerLoginState('email', true, 'loading')).toBe('qr');
    expect(designerLoginState('email', true, 'pending')).toBe('qr');
    expect(designerLoginState('email', true, 'expired')).toBe('qr-expired');
    expect(designerLoginState('email', false, 'pending')).toBe('email');
  });
});
