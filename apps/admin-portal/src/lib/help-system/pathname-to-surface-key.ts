/**
 * pathnameToSurfaceKey — derive an admin-portal help surfaceKey from a
 * Next.js `usePathname()` value.
 *
 * Sprint 2 Stream C.6 (admin). The full `SurfaceKeyProvider` wiring is
 * deferred to Sprint 3 — until then, the utility-bar `?` trigger needs a
 * pathname-driven fallback so the `<ContextualHelpPanel />` can fetch help
 * articles relevant to the current page.
 *
 * Admin-portal routes live under the Next.js route group `(dashboard)` which
 * means there is no `/admin` prefix in the URL — paths are bare top-level
 * segments (e.g. `/dashboard`, `/users`, `/orders`, `/catalog`). The bare `/`
 * route in this app immediately redirects to `/dashboard`, so the home
 * surface is `admin-portal/dashboard`.
 *
 * Mapping strategy (intentionally shallow — only the first non-empty segment
 * is used):
 *   - `/`              → `admin-portal/dashboard` (root redirects to dashboard)
 *   - `/dashboard`     → `admin-portal/dashboard`
 *   - `/users`         → `admin-portal/users`
 *   - `/orders/abc`    → `admin-portal/orders` (dynamic segment dropped)
 *   - `/catalog/new`   → `admin-portal/catalog`
 *
 * The CMS-side article lookup in `<ContextualHelpPanel />` matches articles
 * whose `surfaceKey` is either an exact match OR a *prefix* of the current
 * key, so returning a coarse first-segment key gives the panel the broadest
 * relevant article pool. Sprint 3 will replace this with `useSurfaceKey()`
 * driven by page-level providers, at which point this helper can be removed.
 *
 * Only one admin surface key (`admin-portal/dashboard`) exists in the
 * registry today; for routes without a registered key the panel falls back
 * to its empty state, which is the desired behaviour for Sprint 2.
 *
 * Spec refs:
 *   - docs/prds/Guide/patina-help-guidance-engineering-handoff.md §4.6, §6
 *   - .claude/plans/review-the-documenation-for-compressed-shore.md §6.3
 *   - packages/help-system/src/surfaceKeys.ts (SurfaceKeys.AdminPortal.*)
 */
export function pathnameToSurfaceKey(pathname: string): string {
  // Normalise: ensure leading slash handling, drop trailing slashes (except root).
  const normalised = pathname.replace(/\/+$/, '') || '/';

  // Strip leading slashes to get just the path segments.
  const stripped = normalised.replace(/^\/+/, '');

  // Bare `/` → Dashboard surface (root redirects to /dashboard in this app).
  if (!stripped) {
    return 'admin-portal/dashboard';
  }

  // First path segment only — discards dynamic segments like `[id]` and any
  // deeper nesting. The panel's parent-prefix matching handles drill-down.
  const firstSegment = stripped.split('/')[0];
  return `admin-portal/${firstSegment}`;
}
