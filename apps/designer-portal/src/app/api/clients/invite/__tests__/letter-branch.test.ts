/**
 * The letter branch is body-driven, not flag-driven: there is no server-side
 * flag helper in this portal. These tests pin the two things that matter — the
 * off state is today's path untouched, and the on state never trusts the body
 * for anything the studio's identity depends on.
 */
import { validateLetterRequest } from '../letter-branch';

describe('validateLetterRequest', () => {
  it('is not taken when `letter` is absent — today\'s path, byte for byte', () => {
    expect(validateLetterRequest({ clientEmail: 'a@b.c' })).toEqual({ take: false });
    expect(validateLetterRequest({ clientEmail: 'a@b.c', letter: false })).toEqual({
      take: false,
    });
  });

  it('R4 — trims the note and refuses more than 280 characters', () => {
    expect(
      validateLetterRequest({ clientEmail: 'a@b.c', letter: true, note: '  hi  ' }),
    ).toEqual({ take: true, note: 'hi', projectId: null });

    expect(
      validateLetterRequest({ clientEmail: 'a@b.c', letter: true, note: 'x'.repeat(281) }),
    ).toEqual({ take: false, error: 'That line is longer than 280 characters.' });

    expect(
      validateLetterRequest({ clientEmail: 'a@b.c', letter: true, note: 'x'.repeat(280) }),
    ).toEqual({ take: true, note: 'x'.repeat(280), projectId: null });
  });

  it('treats an empty or whitespace-only note as no note at all', () => {
    expect(
      validateLetterRequest({ clientEmail: 'a@b.c', letter: true, note: '   ' }),
    ).toEqual({ take: true, note: null, projectId: null });
  });

  it('carries the project through', () => {
    expect(
      validateLetterRequest({
        clientEmail: 'a@b.c',
        letter: true,
        projectId: '00000000-0000-0000-0000-000000000001',
      }),
    ).toEqual({
      take: true,
      note: null,
      projectId: '00000000-0000-0000-0000-000000000001',
    });
  });
});
