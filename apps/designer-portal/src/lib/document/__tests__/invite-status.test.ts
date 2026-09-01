import { friendlyInviteError } from '../invite-status';

describe('friendlyInviteError', () => {
  it('translates a bare email_error code from the 200 response', () => {
    expect(friendlyInviteError('send_failed')).toBe(
      'The invite email failed to send. Try sending it again.',
    );
    expect(friendlyInviteError('template_missing')).toBe(
      'The invite email template is temporarily unavailable. Try again in a moment.',
    );
  });

  // supabase-js wraps a thrown edge-function error: FunctionsHttpError's
  // message is "Edge Function returned a non-2xx status: <code>", so the code
  // is mid-string. Anchoring the match at the start (startsWith) sent these to
  // the raw-message fallback and leaked the internal code to the designer.
  it.each([
    [
      'Edge Function returned a non-2xx status: send_failed',
      'The invite email failed to send. Try sending it again.',
    ],
    [
      'Edge Function returned a non-2xx status: template_missing',
      'The invite email template is temporarily unavailable. Try again in a moment.',
    ],
    [
      'Edge Function returned a non-2xx status: already_member',
      'That person is already part of this studio.',
    ],
  ])('maps the wrapped thrown message %p', (message, expected) => {
    expect(friendlyInviteError(new Error(message))).toBe(expected);
  });

  it('falls back to the raw message, then to generic copy', () => {
    expect(friendlyInviteError(new Error('Failed to fetch'))).toBe('Failed to fetch');
    expect(friendlyInviteError(null)).toBe('Failed to send the invite.');
    expect(friendlyInviteError('')).toBe('Failed to send the invite.');
  });
});
