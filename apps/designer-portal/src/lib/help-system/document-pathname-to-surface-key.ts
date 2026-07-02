/**
 * documentPathnameToSurfaceKey (R89) — resolve a help surface key from a
 * (document) route pathname.
 *
 * The (document) shell has no utility bar, so `SurfaceKeyProvider` (mounted in
 * the (document) layout, see components/document/help/document-help.tsx) is
 * seeded with this pathname-derived fallback and re-derives it on every
 * navigation. Each main surface ALSO declares the same key via
 * `useDocumentSurface` — the two agree by construction (both draw from
 * DOCUMENT_SURFACE_KEYS), so a leaf's declaration never fights the fallback.
 *
 * Mapping (first path segment of the (document) group — dynamic + deeper
 * segments collapse to the section, matching the panel's parent-prefix match):
 *   /desk                  → …/document/desk
 *   /doc/[id]              → …/document/doc
 *   /library, /library/[id]→ …/document/library
 *   /people                → …/document/people
 *   /drafting/[id]         → …/document/drafting
 *   /compose               → …/document/compose
 *   anything else          → …/document (root)
 */
import { DOCUMENT_SURFACE_KEYS } from './document-surface-keys';

export function documentPathnameToSurfaceKey(pathname: string): string {
  // Drop any query/hash, trailing slashes, then take the first path segment.
  const clean = (pathname || '/').replace(/[?#].*$/, '').replace(/\/+$/, '') || '/';
  const first = clean.replace(/^\/+/, '').split('/')[0];

  switch (first) {
    case 'desk':
      return DOCUMENT_SURFACE_KEYS.desk;
    case 'doc':
      return DOCUMENT_SURFACE_KEYS.doc;
    case 'library':
      return DOCUMENT_SURFACE_KEYS.library;
    case 'people':
      return DOCUMENT_SURFACE_KEYS.people;
    case 'drafting':
      return DOCUMENT_SURFACE_KEYS.drafting;
    case 'compose':
      return DOCUMENT_SURFACE_KEYS.compose;
    default:
      return DOCUMENT_SURFACE_KEYS.root;
  }
}
