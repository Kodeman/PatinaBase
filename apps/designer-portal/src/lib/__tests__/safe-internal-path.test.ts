import { safeInternalPath } from '../safe-internal-path';

describe('safeInternalPath', () => {
  it('keeps a same-origin path, query and all', () => {
    expect(safeInternalPath('/desk?account=notifications')).toBe(
      '/desk?account=notifications',
    );
    expect(safeInternalPath('/doc/abc/schedule')).toBe('/doc/abc/schedule');
  });

  it('falls back to the Desk for an absent value', () => {
    expect(safeInternalPath(null)).toBe('/desk');
    expect(safeInternalPath(undefined)).toBe('/desk');
    expect(safeInternalPath('')).toBe('/desk');
  });

  it('refuses off-origin and protocol-relative targets', () => {
    expect(safeInternalPath('https://evil.example/desk')).toBe('/desk');
    expect(safeInternalPath('//evil.example')).toBe('/desk');
    expect(safeInternalPath('http://evil.example')).toBe('/desk');
  });

  it('refuses backslash-smuggled protocol-relative targets', () => {
    // Browsers normalise `\` to `/`, so each of these navigates off-origin
    // unless the backslashes are normalised BEFORE the leading-slash test.
    expect(safeInternalPath('/\\evil.example')).toBe('/desk');
    expect(safeInternalPath('\\/evil.example')).toBe('/desk');
    expect(safeInternalPath('\\\\evil.example')).toBe('/desk');
    expect(safeInternalPath('/\\/evil.example')).toBe('/desk');
  });

  it('refuses scheme-bearing values that are not http(s)', () => {
    expect(safeInternalPath('javascript:alert(1)')).toBe('/desk');
    expect(safeInternalPath('data:text/html,<script>')).toBe('/desk');
  });

  it('refuses a bare relative path (no leading slash)', () => {
    expect(safeInternalPath('desk')).toBe('/desk');
    expect(safeInternalPath('../desk')).toBe('/desk');
  });

  it('honours an explicit fallback', () => {
    expect(safeInternalPath('//evil.example', '/auth/signin')).toBe(
      '/auth/signin',
    );
  });
});
