/**
 * Contract test (R89) — surface-key resolution for the Document routes.
 *
 * Pins the pathname → surface-key mapping the (document) layout hands to
 * SurfaceKeyProvider AND the constants the surfaces declare via
 * useDocumentSurface. Both draw from DOCUMENT_SURFACE_KEYS; this test is the
 * lock that keeps the resolver, the registry mirror, and the per-surface
 * declarations agreeing.
 *
 * Imports only pure-string modules (never the @patina/help-system barrel) so
 * the jest transform stays clear of the reference components' ESM.
 */
import { documentPathnameToSurfaceKey } from './document-pathname-to-surface-key';
import { DOCUMENT_SURFACE_KEYS } from './document-surface-keys';

// The surface-key shape law from packages/help-system (kept local to avoid the
// barrel): one-or-more lowercase-alnum-or-hyphen segments, ≥2, slash-joined.
const SURFACE_KEY_REGEX = /^[a-z0-9-]+(\/[a-z0-9-]+)+$/;

describe('documentPathnameToSurfaceKey', () => {
  it('maps each main Document surface to its declared key', () => {
    expect(documentPathnameToSurfaceKey('/desk')).toBe(DOCUMENT_SURFACE_KEYS.desk);
    expect(documentPathnameToSurfaceKey('/doc/abc-123')).toBe(DOCUMENT_SURFACE_KEYS.doc);
    expect(documentPathnameToSurfaceKey('/library')).toBe(DOCUMENT_SURFACE_KEYS.library);
    expect(documentPathnameToSurfaceKey('/people')).toBe(DOCUMENT_SURFACE_KEYS.people);
    expect(documentPathnameToSurfaceKey('/drafting/prop-9')).toBe(DOCUMENT_SURFACE_KEYS.drafting);
    expect(documentPathnameToSurfaceKey('/compose')).toBe(DOCUMENT_SURFACE_KEYS.compose);
  });

  it('collapses dynamic + deeper segments to the section key', () => {
    // Deep-links and query/hash never change the section the panel scopes to.
    expect(documentPathnameToSurfaceKey('/doc/abc/anything')).toBe(DOCUMENT_SURFACE_KEYS.doc);
    expect(documentPathnameToSurfaceKey('/desk/')).toBe(DOCUMENT_SURFACE_KEYS.desk);
    expect(documentPathnameToSurfaceKey('/library?q=chair')).toBe(DOCUMENT_SURFACE_KEYS.library);
    expect(documentPathnameToSurfaceKey('/people#thread')).toBe(DOCUMENT_SURFACE_KEYS.people);
  });

  it('resolves /library/[id] (the Piece) to its own surface — bare /library stays library', () => {
    expect(documentPathnameToSurfaceKey('/library/abc-123')).toBe(DOCUMENT_SURFACE_KEYS.libraryPiece);
    // Deeper segments and query/hash still collapse to the Piece surface.
    expect(documentPathnameToSurfaceKey('/library/abc-123/edit')).toBe(DOCUMENT_SURFACE_KEYS.libraryPiece);
    expect(documentPathnameToSurfaceKey('/library/abc-123?tab=specs')).toBe(DOCUMENT_SURFACE_KEYS.libraryPiece);
    // Trailing slash is NOT an id.
    expect(documentPathnameToSurfaceKey('/library/')).toBe(DOCUMENT_SURFACE_KEYS.library);
  });

  // R21 dissolve — the rehoused surfaces.
  it('/library/judgments is the Library, not a Piece', () => {
    expect(documentPathnameToSurfaceKey('/library/judgments')).toBe(
      DOCUMENT_SURFACE_KEYS.library,
    );
  });

  it('resolves the Rooms roster and a single scan to the Rooms surface', () => {
    expect(documentPathnameToSurfaceKey('/rooms')).toBe(DOCUMENT_SURFACE_KEYS.rooms);
    expect(documentPathnameToSurfaceKey('/room/scan-1')).toBe(DOCUMENT_SURFACE_KEYS.rooms);
    expect(documentPathnameToSurfaceKey('/room/scan-1/file')).toBe(
      DOCUMENT_SURFACE_KEYS.rooms,
    );
  });

  it('falls back to the Document root for unknown / empty paths', () => {
    expect(documentPathnameToSurfaceKey('/')).toBe(DOCUMENT_SURFACE_KEYS.root);
    expect(documentPathnameToSurfaceKey('')).toBe(DOCUMENT_SURFACE_KEYS.root);
    expect(documentPathnameToSurfaceKey('/orders')).toBe(DOCUMENT_SURFACE_KEYS.root);
  });

  it('every resolved key satisfies the surface-key shape law', () => {
    for (const path of ['/desk', '/doc/x', '/library', '/people', '/drafting/x', '/compose', '/']) {
      expect(SURFACE_KEY_REGEX.test(documentPathnameToSurfaceKey(path))).toBe(true);
    }
  });

  it('every mirrored constant satisfies the surface-key shape law', () => {
    for (const key of Object.values(DOCUMENT_SURFACE_KEYS)) {
      expect(SURFACE_KEY_REGEX.test(key)).toBe(true);
    }
  });
});
