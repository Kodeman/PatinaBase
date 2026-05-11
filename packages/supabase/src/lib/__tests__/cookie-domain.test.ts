import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getCookieDomain } from '../cookie-domain';

describe('getCookieDomain', () => {
  const ORIGINAL_ENV = process.env.SUPABASE_COOKIE_DOMAIN;

  beforeEach(() => {
    delete process.env.SUPABASE_COOKIE_DOMAIN;
  });

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) {
      delete process.env.SUPABASE_COOKIE_DOMAIN;
    } else {
      process.env.SUPABASE_COOKIE_DOMAIN = ORIGINAL_ENV;
    }
  });

  it('returns .patina.cloud for app.patina.cloud', () => {
    expect(getCookieDomain('app.patina.cloud')).toBe('.patina.cloud');
  });

  it('returns .patina.cloud for admin.patina.cloud', () => {
    expect(getCookieDomain('admin.patina.cloud')).toBe('.patina.cloud');
  });

  it('returns .patina.cloud for client.patina.cloud', () => {
    expect(getCookieDomain('client.patina.cloud')).toBe('.patina.cloud');
  });

  it('returns .patina.cloud for supabase.patina.cloud', () => {
    expect(getCookieDomain('supabase.patina.cloud')).toBe('.patina.cloud');
  });

  it('returns .patina.cloud for the apex domain', () => {
    expect(getCookieDomain('patina.cloud')).toBe('.patina.cloud');
  });

  it('returns undefined for localhost', () => {
    expect(getCookieDomain('localhost')).toBeUndefined();
  });

  it('returns undefined for a 127.0.0.1 IP address', () => {
    expect(getCookieDomain('127.0.0.1')).toBeUndefined();
  });

  it('returns undefined for a private LAN IP', () => {
    expect(getCookieDomain('192.168.1.14')).toBeUndefined();
  });

  it('returns undefined for an unrelated host', () => {
    expect(getCookieDomain('example.com')).toBeUndefined();
  });

  it('returns undefined for .local hostnames', () => {
    expect(getCookieDomain('mymac.local')).toBeUndefined();
  });

  it('returns undefined for hosts that look similar but are not patina.cloud', () => {
    // Defends against accidental suffix matches like `foo-patina.cloud` or
    // `patina.cloud.attacker.com`. Neither should be treated as patina.cloud.
    expect(getCookieDomain('foo-patina.cloud')).toBeUndefined();
    expect(getCookieDomain('patina.cloud.attacker.com')).toBeUndefined();
  });

  it('returns SUPABASE_COOKIE_DOMAIN when no host is provided server-side', () => {
    process.env.SUPABASE_COOKIE_DOMAIN = '.example.com';
    expect(getCookieDomain()).toBe('.example.com');
  });

  it('ignores SUPABASE_COOKIE_DOMAIN when host is explicitly provided', () => {
    process.env.SUPABASE_COOKIE_DOMAIN = '.example.com';
    expect(getCookieDomain('localhost')).toBeUndefined();
    expect(getCookieDomain('app.patina.cloud')).toBe('.patina.cloud');
  });

  it('returns undefined when no host and no env var are available', () => {
    expect(getCookieDomain()).toBeUndefined();
  });
});
