/**
 * Provider ids as Supabase expects them. Supabase calls Microsoft Entra ID
 * `azure`; presentation code should label that provider "Microsoft".
 */
export type OAuthProvider = 'apple' | 'google' | 'azure';

const OAUTH_PROVIDER_LABELS: Record<OAuthProvider, string> = {
  apple: 'Apple',
  google: 'Google',
  azure: 'Microsoft',
};

const OAUTH_PROVIDER_ORDER: ReadonlyArray<OAuthProvider> = [
  'apple',
  'google',
  'azure',
];

/**
 * Parse the public provider allow-list without allowing an unknown value to be
 * cast into an auth request. Results always follow the product-defined order,
 * regardless of env-var order.
 */
export function parseOAuthProviders(value?: string): ReadonlyArray<OAuthProvider> {
  const configured = new Set(
    (value ?? 'apple')
      .split(',')
      .map((provider) => provider.trim().toLowerCase())
      .filter(Boolean),
  );

  return OAUTH_PROVIDER_ORDER.filter((provider) => configured.has(provider));
}

export const ENABLED_OAUTH_PROVIDERS: ReadonlyArray<OAuthProvider> =
  parseOAuthProviders(process.env.NEXT_PUBLIC_ENABLED_OAUTH_PROVIDERS);

export function isOAuthProviderEnabled(provider: OAuthProvider): boolean {
  return ENABLED_OAUTH_PROVIDERS.includes(provider);
}

export function getOAuthProviderLabel(provider: OAuthProvider): string {
  return OAUTH_PROVIDER_LABELS[provider];
}
