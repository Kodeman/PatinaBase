export type OAuthProvider = 'google' | 'apple';

export const ENABLED_OAUTH_PROVIDERS: ReadonlyArray<OAuthProvider> = (
  (process.env.NEXT_PUBLIC_ENABLED_OAUTH_PROVIDERS ?? 'apple')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean) as Array<OAuthProvider>
);

export function isOAuthProviderEnabled(provider: OAuthProvider): boolean {
  return ENABLED_OAUTH_PROVIDERS.includes(provider);
}
