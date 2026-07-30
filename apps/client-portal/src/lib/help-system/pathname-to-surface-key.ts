/**
 * pathnameToSurfaceKey — derive a client-portal help surfaceKey from a
 * Next.js `usePathname()` value.
 *
 * Sprint 2 Stream C.6 (client). The full `SurfaceKeyProvider` wiring is
 * deferred to Sprint 3 — until then, the client-header `?` trigger needs a
 * pathname-driven fallback so the `<ContextualHelpPanel />` can fetch help
 * articles relevant to the page the homeowner is on.
 *
 * Like the designer portal (whose routes now mount at the host root too, post
 * R21), the client-portal mounts its routes at the host root — there is no prefix
 * to strip. The bare `/` is a redirect to `/projects`, and `/today` is the
 * dashboard a homeowner lands on day-to-day. Both map to the single
 * registered client surface key today (`client-portal/home`); other routes
 * fall through to a first-segment key so as authors register new client
 * surfaces in `SurfaceKeys.ClientPortal.*` the panel will pick them up
 * without code changes here.
 *
 * Mapping strategy (intentionally shallow — only the first segment is used):
 *   - `/`                       → `client-portal/home`     (bare host root)
 *   - `/today`                  → `client-portal/home`     (dashboard alias)
 *   - `/projects`               → `client-portal/projects`
 *   - `/projects/abc/timeline`  → `client-portal/projects` (dynamic + nested dropped)
 *   - `/scans`                  → `client-portal/scans`
 *   - `/messages`               → `client-portal/messages`
 *
 * The CMS-side article lookup in `<ContextualHelpPanel />` matches articles
 * whose `surfaceKey` is either an exact match OR a *prefix* of the current
 * key, so returning a coarse first-segment key gives the panel the broadest
 * relevant article pool. Sprint 3 will replace this with `useSurfaceKey()`
 * driven by page-level providers, at which point this helper can be removed.
 *
 * Spec refs:
 *   - docs/prds/Guide/patina-help-guidance-engineering-handoff.md §4.6, §6
 *   - .claude/plans/review-the-documenation-for-compressed-shore.md §6.3
 *
 * Note: the homeowner voice differs from the designer voice (consumer vs.
 * pro), so authors will write distinct copy against these keys. The mapper
 * itself is voice-agnostic — it just hands the right surface to the panel.
 */
export function pathnameToSurfaceKey(pathname: string): string {
  // Normalise: ensure leading slash, drop any trailing slashes (except root).
  const normalised = pathname.replace(/\/+$/, '') || '/';

  // Trim the leading slash so split() doesn't yield an empty first element.
  const stripped = normalised.replace(/^\/+/, '');

  // Bare host root or `/today` (the homeowner dashboard) → the canonical
  // `home` surface. Mapping `/today` here keeps Sprint-2 registry coverage
  // intact without needing a second key — when authors add a dedicated
  // `Today` key in `SurfaceKeys.ClientPortal.*`, remove this alias.
  if (!stripped || stripped === 'today') {
    return 'client-portal/home';
  }

  // First path segment only — discards dynamic segments like `[projectId]`
  // and any deeper nesting. The panel's parent-prefix matching handles
  // drill-down once authors register child surfaces.
  const firstSegment = stripped.split('/')[0];
  return `client-portal/${firstSegment}`;
}
