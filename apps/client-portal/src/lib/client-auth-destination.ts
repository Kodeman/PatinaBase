/**
 * Where every client auth method lands. The house, not the retired `/projects`
 * list — landing on the list rendered it in full server-side before the route
 * collapse replaced it, so every sign-in flashed a page the client is never
 * meant to see again. The collapse now serves stale bookmarks only.
 *
 * Its OWN module, because `middleware.ts` imports it: `auth-redirect.ts` also
 * exports helpers whose default parameters read `window`, and the edge bundle
 * should not depend on a module that holds browser-only code.
 */
export const CLIENT_AUTH_DESTINATION = '/';
