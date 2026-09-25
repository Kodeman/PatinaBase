# NI-04 — Lexicon copy packet: one recommended sentence per Field site

Ruling (Kody, 2026-09-24, Q3): "Fable picks." NI-04 is an XS ticket — the packet's
recommendations apply, and Kody reads the three meaning-bearing strings below at review.
Voice: Designer-Taught Intelligence — never "AI" or "inbox", no engineer-speak, no engagement
bait. Cross-referenced against the nine `needsRuling` rows of `lexicon.json` and
`lexicon.md` §9.

## Read these three first

1. **The merged "no longer here" line.** `PieceSheetScreen.swift` (C5, missing-piece fallback)
   said "That specimen is no longer here." and `RouteSessionUI.swift` (route-missing fallback)
   said "This capture is no longer here" — two sentences, two nouns, same meaning. Both are
   now the same sentence: **"This piece is no longer here."** `RouteSessionUI.swift` keeps its
   own subtitle, "It may have already been routed."; `PieceSheetScreen.swift` has no subtitle
   and stays a single line.
2. **The persisted sync error.** `LocalCaptureSyncService.swift:32` (`LocalSyncError.pieceNotFound`)
   read "Piece \(id) not found in the local store." — engineer-speak regardless of noun, and its
   sibling cases in the same enum are plain designer-facing sentences ("Not signed in — captures
   stay queued until you connect."). Recommended: **"This piece could not be found on this
   iPhone."** — drops the raw id (a UUID is not something a designer reads) and matches the
   sibling cases' voice and their "on this iPhone" phrasing (reused from
   `SyncStatusScreen.inMemoryWarning`). **Rows already persisted into `Specimen.lastSyncError`
   before this rename keep the old noun on disk** — this proposal does not touch the persistence
   layer or add a display-time remap; `Piece+Accessors.swift` (not in this ticket's declared
   files) is where that one-line remap-on-read would live if Kody wants it. Recorded here, not
   built here.
3. **The Ready screen's non-Action-Button line.** `ReadyScreen.swift` — W1A-03 already rewrote
   both branches to say only what's true today (no `ControlWidget`/`AppIntent` exists): the
   non-Action-Button branch now reads "Open Patina Field from the Home Screen whenever you're
   ready to capture." (subtitle) and "Open from the Home Screen" / "Tap the Patina Field icon to
   start capturing." (hardware card). On voice, no promise it can't keep. **No change proposed** —
   flagged only because Kody asked to read it, not because it needs work.

---

## The eleven sites

| # | site | old | recommended | change? |
|---|---|---|---|---|
| 1 | `ViewfinderControls.swift:251` (accessibilityHint) | "Tap to capture, hold for a multi-shot piece" | **"Tap to capture, hold to add more shots to this piece"** | yes — reads as an instruction, not a label |
| 2 | `TagOCRSheet.swift:101` (primary button, recognised state) | "Add to piece" | **"Add to this piece"** | yes — "to piece" reads thin without an article; both states move together |
| 3 | `TagOCRSheet.swift:154` (primary button, manual-entry state) | "Add to piece" | **"Add to this piece"** | yes — same button, same sentence as #2 |
| 4 | `ResilienceScreens.swift:86` (photo-import subtitle) | "Pull existing shots into a piece" | "Pull existing shots into a piece" | no — already plain, no engineer-speak |
| 5 | `RootView.swift:221` (Companion hint, `.piece` route) | "Review this piece" | "Review this piece" | no — already plain |
| 6 | `PieceSheetScreen.swift:38` (navigationTitle) | "Piece" | "Piece" | no — a title bar has no room for more, and the sheet's own content says what piece |
| 7 | `PieceSheetScreen.swift:366` (`PieceMissingView`) | "That specimen is no longer here." | **"This piece is no longer here."** | yes — merged with #8, see above |
| 8 | `RouteSessionUI.swift:260` (`RouteMissingPiece`) | "This capture is no longer here" | **"This piece is no longer here."** | yes — merged with #7, see above |
| 9 | `LocalCaptureSyncService.swift:32` (`LocalSyncError.pieceNotFound`) | "Piece \(id) not found in the local store." | **"This piece could not be found on this iPhone."** | yes — see "the persisted sync error" above |
| 10 | `RootView.swift:223` (Companion hint, `.session` route) | "Review this session" | "Review this session" | no — different noun on purpose (a session, not a piece); already plain |
| 11 | `SyncStatusScreen.swift:103-162` (open-report notices) | `inMemoryWarning`, `preservedStoreNotice`, `carryAwaitingRestoreNotice` | unchanged | no — already on-voice, plain, no "AI"/"inbox", states the consequence and what Patina will do; nothing to fix |

## What this ticket did not do

- No change to `field_captures.capture_kind = 'specimen'` (server column, out of scope per
  `lexicon.md` §5e).
- No change to `Piece+Accessors.swift` or any remap of already-persisted `lastSyncError` text —
  named above, not built.
- No change to `CaptureScreenID` raw values, analytics event names, or the persisted
  `@AppStorage` key — all frozen per `lexicon.md` §4–5 and untouched by this packet.
