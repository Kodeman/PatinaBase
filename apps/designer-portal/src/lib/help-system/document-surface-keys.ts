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
  rooms:    'designer-portal/document/rooms',
  drafting: 'designer-portal/document/drafting',
  compose:  'designer-portal/document/compose',
  // ─── Desk-era additions (help-desk Wave 0) — mirror of the canonical
  // `Document.*` desk-era block in packages/help-system/src/surfaceKeys.ts.
  // The ledger keys are set by the sheet-open hook (use-sheet-surface-key.ts,
  // sheets don't change the pathname); the authoring/doorway keys (margin,
  // commandBar, coordination, contents) are passed explicitly by their `?`
  // doorways. surface-key-parity.test.ts pins every value against the
  // canonical registry.
  orders:          'designer-portal/document/orders',
  accounts:        'designer-portal/document/accounts',
  hours:           'designer-portal/document/hours',
  thePost:         'designer-portal/document/the-post',
  ordersWeek:      'designer-portal/document/orders/week',
  ordersReceiving: 'designer-portal/document/orders/receiving',
  ordersVendors:   'designer-portal/document/orders/vendors',
  margin:          'designer-portal/document/margin',
  commandBar:      'designer-portal/document/command-bar',
  coordination:    'designer-portal/document/coordination',
  contents:        'designer-portal/document/contents',
  // The (document)-era welcome modal — distinct from the legacy
  // `designer-portal/welcome`.
  welcome:         'designer-portal/document/welcome',
  // /library/[id] (the Piece), a person party open, the Desk field rollup.
  libraryPiece:    'designer-portal/document/library/piece',
  peoplePerson:    'designer-portal/document/people/person',
  deskField:       'designer-portal/document/desk/field',
  // Wave 3 — the Call Sheet's own key (distinct from `coordination`, which
  // court-bar.tsx already owns for the ball-in-court help panel).
  callSheet:       'designer-portal/document/call-sheet',
  // /doc/[id]/plans — the Plan Room (the current set, the light table, the
  // drawing log, the issue ceremony).
  plans:           'designer-portal/document/plans',
} as const;

export type DocumentSurfaceKey =
  (typeof DOCUMENT_SURFACE_KEYS)[keyof typeof DOCUMENT_SURFACE_KEYS];
