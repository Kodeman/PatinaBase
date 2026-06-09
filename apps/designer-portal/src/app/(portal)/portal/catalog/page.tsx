import { redirect } from 'next/navigation';

/**
 * The legacy single-tier catalog list page was removed in the 2026-06-09
 * navigation restructure — Products is now the three-layer Library. Anything
 * still pointing at /portal/catalog (bookmarks, stale links) lands on My
 * Library. Product detail/edit/new/import and collections/categories still
 * live under /portal/catalog/* and are unaffected.
 */
export default function CatalogIndexRedirect() {
  redirect('/portal/library/personal');
}
