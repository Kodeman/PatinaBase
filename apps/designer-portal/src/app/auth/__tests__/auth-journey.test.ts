import {
  callbackDestination,
  confirmedSession,
  DESIGNER_SIGNIN_METHODS,
  designerDestination,
  designerSignInNotice,
} from '../auth-journey';
import * as authJourney from '../auth-journey';

describe('designer auth journey', () => {
  it('keeps the approved method order and email OTP as the default', () => {
    expect(DESIGNER_SIGNIN_METHODS).toEqual(['email-otp', 'apple', 'password']);
  });

  it('no longer offers QR as a right-pane method — the brand pane owns it', () => {
    expect(DESIGNER_SIGNIN_METHODS).not.toContain('qr');
    expect(authJourney).not.toHaveProperty('shouldActivateQr');
    expect(authJourney).not.toHaveProperty('qrPresentation');
    expect(authJourney).not.toHaveProperty('designerLoginState');
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
});
