/**
 * pathnameToSurfaceKey — derive a designer-portal help surfaceKey from a
 * Next.js `usePathname()` value.
 *
 * Sprint 2 Stream C.6 (designer). The full `SurfaceKeyProvider` wiring is
 * deferred to Sprint 3 — until then, the utility-bar `?` trigger needs a
 * pathname-driven fallback so the `<ContextualHelpPanel />` can fetch help
 * articles relevant to the current page.
 *
 * Mapping strategy (intentionally shallow — only the first segment after the
 * `/portal` prefix is used):
 *   - `/portal`              → `designer-portal/today`
 *   - `/portal/`             → `designer-portal/today`
 *   - `/portal/pipeline`     → `designer-portal/pipeline`
 *   - `/portal/projects/abc` → `designer-portal/projects` (dynamic segment dropped)
 *   - `/portal/aesthete`     → `designer-portal/aesthete`
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
 */
export function pathnameToSurfaceKey(pathname: string): string {
  // Normalise: ensure leading slash, drop any trailing slashes (except root).
  const normalised = pathname.replace(/\/+$/, '') || '/';

  // Strip the portal route prefix. Both `/portal` and `/portal/...` collapse
  // down to whatever follows the prefix.
  const stripped = normalised
    .replace(/^\/portal(?=\/|$)/, '')
    .replace(/^\/+/, '');

  // Bare `/portal` → Today dashboard surface.
  if (!stripped) {
    return 'designer-portal/today';
  }

  // First path segment only — discards dynamic segments like `[id]` and any
  // deeper nesting. The panel's parent-prefix matching handles drill-down.
  const firstSegment = stripped.split('/')[0];
  return `designer-portal/${firstSegment}`;
}
