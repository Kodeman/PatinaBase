/**
 * Document surface keys (R89) — the app-side mirror of
 * `SurfaceKeys.DesignerPortal.Document` in
 * `packages/help-system/src/surfaceKeys.ts` (the canonical registry that Sanity
 * authoring + cross-platform tooling read).
 *
 * Mirrored here as plain string literals with NO dependency on the
 * `@patina/help-system` barrel, so the pathname resolver and its contract test
 * import only pure strings. (The barrel pulls the Layer-4 reference components,
 * whose `@portabletext/react` ESM the jest transform can't load — the
 * paths-mapped ESM gotcha logged in MEMORY.) Keep the two in sync; the
 * resolver's contract test pins these values.
 */
export const DOCUMENT_SURFACE_KEYS = {
  root:     'designer-portal/document',
  desk:     'designer-portal/document/desk',
  doc:      'designer-portal/document/doc',
  library:  'designer-portal/document/library',
  people:   'designer-portal/document/people',
  drafting: 'designer-portal/document/drafting',
  compose:  'designer-portal/document/compose',
} as const;

export type DocumentSurfaceKey =
  (typeof DOCUMENT_SURFACE_KEYS)[keyof typeof DOCUMENT_SURFACE_KEYS];
