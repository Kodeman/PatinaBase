/**
 * Client-portal role gate — pure logic shared by `middleware.ts` (server/edge)
 * and the `/wrong-portal` interstitial (client). Kept dependency-free (only a
 * type-only import) so it is trivially unit-testable and safe to bundle into
 * both the Worker and the browser.
 *
 * Two seams live here:
 *  1. `resolvePortalDecision` — given the outcome of a `user_roles` lookup and
 *     the requested path, decide whether to let the request through, redirect a
 *     wrong-role user to `/wrong-portal`, or (when the lookup could not run)
 *     skip the check without bricking the portal.
 *  2. `resolveForeignPortalHome` / `describeAccountKind` — map the signed-in
 *     user's role NAMES to the portal they actually belong on, for the copy and
 *     the escape hatch on the interstitial.
 */

import type { Database } from '@patina/supabase';

export type RoleDomain = Database['public']['Enums']['role_domain'];

// Domains permitted on the client portal shell. `consumer` covers app_user /
// client roles (homeowners engaging designers); `admin` covers staff who need
// cross-portal access for ops/support. Mirrors the designer portal's own list.
export const CLIENT_PORTAL_DOMAINS: readonly RoleDomain[] = ['consumer', 'admin'];

/**
 * Outcome of looking up a user's role domains.
 * - `ok`: the lookup ran; `domains` is the (possibly empty) set of role domains.
 * - `unavailable`: the lookup could NOT run (service-role key missing, or the
 *   query threw). The caller must not silently allow — it logs and either lets
 *   the request through with a marker header (protected routes) or proceeds on
 *   an exempt route.
 */
export type RoleLookup =
  | { status: 'ok'; domains: RoleDomain[] }
  | { status: 'unavailable'; reason: 'missing-service-key' | 'lookup-error' };

/**
 * Decision for an authenticated user on a role-gated path.
 * - `next`: allow through unchanged (user has a permitted role).
 * - `skip`: allow through but the caller stamps `x-patina-role-check: skipped`
 *   and logs — the role check could not be evaluated.
 * - `redirect`: send the user to `to` (the `/wrong-portal` interstitial).
 */
export type PortalDecision =
  | { action: 'next' }
  | { action: 'skip'; reason: 'missing-service-key' | 'lookup-error' }
  | { action: 'redirect'; to: string };

/**
 * Sanitizes an untrusted `callbackUrl` query param before it is used to build
 * a post-auth redirect target (`new URL(callbackUrl, baseUrl)` in middleware.ts).
 * `new URL()` ignores its base when the first argument is already absolute, so
 * an unsanitized callbackUrl is an open redirect (`?callbackUrl=https://evil.com`
 * sends a freshly-authenticated user off-site). Also rejects protocol-relative
 * (`//evil.com`, which `new URL()` resolves against the current protocol to
 * `https://evil.com`) and a leading backslash (`/\evil.com` — WHATWG URL
 * parsing normalizes `\` to `/` for special schemes, so this resolves the same
 * way as `//evil.com`). Only a plain single-leading-slash path is honored;
 * anything else returns `null` so the caller falls back to its default
 * post-auth destination.
 */
export function safeCallbackPath(raw: string | null): string | null {
  if (!raw) return null;
  return /^\/(?![\/\\])/.test(raw) ? raw : null;
}

/** True when any of the user's role domains permits the client portal. */
export function hasClientPortalDomain(domains: RoleDomain[]): boolean {
  return domains.some((domain) => CLIENT_PORTAL_DOMAINS.includes(domain));
}

/**
 * The first domain that does NOT permit the client portal — the authoritative
 * "which portal do they belong on" signal. `null` when the user has no domains
 * or all are permitted.
 */
export function firstForeignDomain(domains: RoleDomain[]): RoleDomain | null {
  return domains.find((domain) => !CLIENT_PORTAL_DOMAINS.includes(domain)) ?? null;
}

/**
 * Pure gate decision for an AUTHENTICATED user on a role-gated route. Path
 * classification (auth/public/api/RSC bypasses) stays in the caller; this only
 * decides allow-vs-redirect-vs-skip and builds the `/wrong-portal` target.
 *
 * The redirect carries the original destination as `?from=` (breadcrumb) and
 * the user's foreign role domain as `?as=` (authoritative). The `as` hint is
 * needed because the interstitial cannot trust client-side JWT roles: no
 * custom-access-token hook is configured, so `app_metadata.roles` is unpopulated
 * and `useAuth()` defaults everyone to `['client']`. Without this hint a
 * redirected designer would be told they are "a homeowner".
 */
export function resolvePortalDecision(lookup: RoleLookup, path: string): PortalDecision {
  if (lookup.status === 'unavailable') {
    return { action: 'skip', reason: lookup.reason };
  }
  if (hasClientPortalDomain(lookup.domains)) {
    return { action: 'next' };
  }
  const foreign = firstForeignDomain(lookup.domains);
  const to = foreign
    ? `/wrong-portal?from=${encodeURIComponent(path)}&as=${foreign}`
    : `/wrong-portal?from=${encodeURIComponent(path)}`;
  return { action: 'redirect', to };
}

// Role NAMES (from `roles.name`, plus legacy simple names still seen in JWT
// app_metadata) grouped by the portal they belong on. Sourced from the roles
// seed (supabase/migrations/00022) and the legacy → modern mapping (00126).
const ADMIN_ROLE_NAMES = new Set([
  'super_admin',
  'ml_operator',
  'quality_control',
  'support_agent',
  // legacy simple names
  'admin',
  'support',
]);

const DESIGNER_ROLE_NAMES = new Set([
  'independent_designer',
  'studio_owner',
  'studio_admin',
  'studio_designer',
  // legacy simple names
  'designer',
  'studio_manager',
]);

const MANUFACTURER_ROLE_NAMES = new Set([
  'brand_admin',
  'catalog_manager',
  'operations_lead',
  'partner_manager',
  // legacy simple name
  'manufacturer',
]);

const CONSUMER_ROLE_NAMES = new Set(['app_user', 'client', 'homeowner']);

/**
 * Map the signed-in user's role NAMES to the portal they actually belong on.
 * Returns `null` when there is no distinct home to send them to (consumer,
 * manufacturer, or unknown) — the interstitial then shows only the sign-out
 * escape hatch. Admin takes priority over designer for multi-role staff.
 */
export function resolveForeignPortalHome(
  roleNames: string[],
): { label: string; url: string } | null {
  if (roleNames.some((role) => ADMIN_ROLE_NAMES.has(role))) {
    return { label: 'Patina Admin', url: 'https://admin.patina.cloud' };
  }
  if (roleNames.some((role) => DESIGNER_ROLE_NAMES.has(role))) {
    return { label: 'the Patina designer workspace', url: 'https://app.patina.cloud' };
  }
  return null;
}

/** Human-friendly noun phrase for the account kind, used in the interstitial copy. */
export function describeAccountKind(roleNames: string[]): string {
  if (roleNames.some((role) => ADMIN_ROLE_NAMES.has(role))) return 'an administrator';
  if (roleNames.some((role) => DESIGNER_ROLE_NAMES.has(role))) return 'a designer';
  if (roleNames.some((role) => MANUFACTURER_ROLE_NAMES.has(role))) return 'a manufacturer';
  if (roleNames.some((role) => CONSUMER_ROLE_NAMES.has(role))) return 'a homeowner';
  return 'a non-homeowner';
}

/**
 * Authoritative variant of {@link resolveForeignPortalHome}, keyed off the role
 * DOMAIN the middleware passes via `?as=` (derived from a service-role DB
 * lookup, not the untrusted JWT). Accepts an arbitrary string since it comes
 * from the URL; unknown/permitted domains yield `null`.
 */
export function foreignPortalFromDomain(domain: string): { label: string; url: string } | null {
  if (domain === 'admin') return { label: 'Patina Admin', url: 'https://admin.patina.cloud' };
  if (domain === 'designer') {
    return { label: 'the Patina designer workspace', url: 'https://app.patina.cloud' };
  }
  if (domain === 'manufacturer') {
    return { label: 'the Patina maker workspace', url: 'https://manufacturer.patina.cloud' };
  }
  return null;
}

/** Authoritative variant of {@link describeAccountKind}, keyed off the role domain. */
export function describeAccountKindFromDomain(domain: string): string {
  switch (domain) {
    case 'admin':
      return 'an administrator';
    case 'designer':
      return 'a designer';
    case 'manufacturer':
      return 'a manufacturer';
    case 'consumer':
      return 'a homeowner';
    default:
      return 'a non-homeowner';
  }
}
