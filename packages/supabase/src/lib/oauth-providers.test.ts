import { describe, expect, it } from 'vitest';
import { getOAuthProviderLabel, parseOAuthProviders } from './oauth-providers';

describe('parseOAuthProviders', () => {
  it('defaults to Apple', () => {
    expect(parseOAuthProviders()).toEqual(['apple']);
  });

  it('filters unknown values, removes duplicates, and fixes presentation order', () => {
    expect(
      parseOAuthProviders('azure, unknown,google,apple,google'),
    ).toEqual(['apple', 'google', 'azure']);
  });

  it('accepts whitespace and case without enabling absent providers', () => {
    expect(parseOAuthProviders(' GOOGLE, Azure ')).toEqual(['google', 'azure']);
  });

  it('uses the customer-facing Microsoft name for Supabase azure', () => {
    expect(getOAuthProviderLabel('apple')).toBe('Apple');
    expect(getOAuthProviderLabel('google')).toBe('Google');
    expect(getOAuthProviderLabel('azure')).toBe('Microsoft');
  });
});
